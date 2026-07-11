// app.js

const API_BASE = window.location.protocol === "file:" ? "http://100.82.55.92:8050" : "";
const API_URL = `${API_BASE}/api/metrics`;
const CONTROL_CONTAINER_URL = `${API_BASE}/api/control/container`;
const CONTROL_SERVICE_URL = `${API_BASE}/api/control/service`;
const CONTROL_LOGS_URL = `${API_BASE}/api/control/logs`;
const CONTROL_CANCEL_TASK_URL = `${API_BASE}/api/control/task/cancel`;
const POLL_INTERVAL = 2500; // 2.5 seconds

// Heatmap configuration
const GRID_COLS = 16;
const GRID_ROWS = 8;
const CELL_SIZE = 10;
const CELL_GAP = 1;

// Global tracking variables
const gpuGrids = {};
let activeLogTarget = null; // { node_id, type, name }
let logPollIntervalId = null;

function getOrCreateGrid(nodeId) {
    if (!gpuGrids[nodeId]) {
        let grid = [];
        for (let r = 0; r < GRID_ROWS; r++) {
            grid[r] = [];
            for (let c = 0; c < GRID_COLS; c++) {
                const distToCenter = Math.sqrt(Math.pow(r - GRID_ROWS/2, 2) + Math.pow(c - GRID_COLS/2, 2));
                const baseTemp = Math.max(35, 75 - distToCenter * 8);
                grid[r][c] = baseTemp;
            }
        }
        gpuGrids[nodeId] = grid;
    }
    return gpuGrids[nodeId];
}

function updateHeatmap(canvas, gridState, coreTemp, utilization) {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    // Clear canvas
    ctx.fillStyle = '#19171e';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    const activityFactor = utilization / 100.0;
    
    for (let r = 0; r < GRID_ROWS; r++) {
        for (let c = 0; c < GRID_COLS; c++) {
            const targetTemp = gridState[r][c] + (Math.random() - 0.5) * 4 + (coreTemp - 45) * activityFactor;
            
            let color = 'rgb(30, 30, 45)'; // Off state
            if (coreTemp > 0) {
                const tempNormalized = Math.min(1.0, Math.max(0.0, (targetTemp - 30) / 60)); // 30C to 90C
                
                let red, green, blue;
                if (tempNormalized < 0.5) {
                    const t = tempNormalized * 2;
                    red = Math.round(30 + t * 100);
                    green = Math.round(30 - t * 15);
                    blue = Math.round(100 + t * 50);
                } else {
                    const t = (tempNormalized - 0.5) * 2;
                    red = Math.round(130 + t * 125);
                    green = Math.round(15 + t * 90);
                    blue = Math.round(150 - t * 130);
                }
                color = `rgb(${red}, ${green}, ${blue})`;
            }
            
            ctx.fillStyle = color;
            ctx.fillRect(
                c * (CELL_SIZE + CELL_GAP),
                r * (CELL_SIZE + CELL_GAP),
                CELL_SIZE,
                CELL_SIZE
            );
        }
    }
}

function formatBytes(bytes) {
    if (bytes === 0) return '0B';
    const k = 1024;
    const sizes = ['KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + sizes[i];
}

function formatTokenCount(num) {
    if (num >= 1_000_000) return (num / 1_000_000).toFixed(2) + "M";
    if (num >= 1_000) return (num / 1_000).toFixed(1) + "k";
    return num;
}

function updateClock() {
    const clock = document.getElementById("timestamp-clock");
    if (clock) {
        const now = new Date();
        clock.textContent = now.toTimeString().split(' ')[0];
    }
}

// Global dismiss state for alarms
let dismissedAlarms = new Set();

function clearKernelAlarm() {
    document.getElementById("kernel-alarm").style.display = "none";
    // Mark active alarm texts as dismissed so they don't pop back up immediately
    const text = document.getElementById("kernel-alarm-desc").textContent;
    dismissedAlarms.add(text);
}

async function fetchTelemetry() {
    try {
        const response = await fetch(API_URL);
        if (!response.ok) throw new Error("API returned non-200 status");
        
        const data = await response.json();
        
        // Update connection status
        document.getElementById("status-dot").className = "status-indicator online";
        document.getElementById("status-label").textContent = "CLUSTER ONLINE";
        
        // Render Nodes Hardware Health dynamically
        renderHardwareCards(data.nodes);
        
        // Render Cluster Memory Hogs table
        renderMemoryHogs(data.nodes);
        
        // Render Docker Containers Control Center
        renderControlCenter(data.nodes);
        
        // Update vLLM queue and cache metrics
        updateQueueMetrics(data.queue, data.vllm);
        
        // Update kernel/driver OOM and Xid logs
        checkKernelAlarms(data.nodes);
        
        // Repetition diagnostics (stuck loop check from SQLite on local primary)
        // Find if local primary has chat logs
        let chatLooping = false;
        let repScore = 1.0;
        let latestPrompt = "Waiting for query...";
        let latestResponse = "System idle.";
        
        for (const nid in data.nodes) {
            const n = data.nodes[nid];
            // If the chat SQLite diagnostics were captured on the host
            if (n.chat_loop_diagnostics) {
                chatLooping = n.chat_loop_diagnostics.is_looping;
                repScore = n.chat_loop_diagnostics.repetition_score;
                latestPrompt = n.chat_loop_diagnostics.latest_prompt || latestPrompt;
                latestResponse = n.chat_loop_diagnostics.latest_response || latestResponse;
                break;
            }
        }
        
        // Update repetition dials
        const repPercentage = Math.round(repScore * 100);
        document.getElementById("repetition-score-val").textContent = `${repPercentage}%`;
        const circle = document.getElementById("gauge-fill-circle");
        const radius = circle.r.baseVal.value;
        const circumference = 2 * Math.PI * radius; // 251.2
        const offset = circumference * (1.0 - repScore);
        circle.style.strokeDashoffset = offset;
        
        // Loop Warning Banner
        const alertBanner = document.getElementById("looping-alert");
        const badge = document.getElementById("generator-status-badge");
        const desc = document.getElementById("generator-status-desc");
        if (chatLooping) {
            alertBanner.style.display = "flex";
            badge.textContent = "LOOP ALERT";
            badge.className = "status-badge status-warning";
            desc.textContent = `CRITICAL: Repetitive sequence detected (Uniqueness: ${repPercentage}%). The model appears stuck in a loop.`;
        } else {
            alertBanner.style.display = "none";
            badge.textContent = "OPTIMAL";
            badge.className = "status-badge status-healthy";
            desc.textContent = "AI generation token n-grams reflect high entropy and correct language structure.";
        }
        
        // Update Live Output stream terminal
        document.getElementById("terminal-prompt").textContent = latestPrompt;
        document.getElementById("terminal-response").textContent = latestResponse;
        
    } catch (error) {
        document.getElementById("status-dot").className = "status-indicator offline";
        document.getElementById("status-label").textContent = "CLUSTER OFFLINE";
        console.error("Telemetry fetch error:", error);
    }
}

function renderHardwareCards(nodes) {
    const container = document.getElementById("nodes-container");
    if (!container) return;
    
    let html = "";
    
    for (const nodeId in nodes) {
        const node = nodes[nodeId];
        if (!node.online) {
            html += `
                <div class="node-card neumorphic-raised offline">
                    <div class="node-card-header">
                        <h3>${nodeId}</h3>
                        <span class="node-badge offline">OFFLINE</span>
                    </div>
                    <div class="node-body">
                        <p class="offline-placeholder">Failed to connect to host over Tailscale/SSH</p>
                    </div>
                </div>
            `;
            continue;
        }
        
        const ramUsedGB = (node.ram.used / 1024).toFixed(1);
        const ramTotalGB = (node.ram.total / 1024).toFixed(1);
        const ramPerc = node.ram.total ? Math.round((node.ram.used / node.ram.total) * 100) : 0;
        
        let gpuHtml = "";
        if (node.gpu.online) {
            const vramUsedGB = (node.gpu.mem_used / 1024).toFixed(1);
            const vramTotalGB = (node.gpu.mem_total / 1024).toFixed(1);
            const vramPerc = node.gpu.mem_total ? Math.round((node.gpu.mem_used / node.gpu.mem_total) * 100) : 0;
            
            // Check throttle badge
            let throttleBadge = "";
            if (node.gpu.throttle_reason && node.gpu.throttle_reason !== "None") {
                throttleBadge = `<span class="gpu-badge status-warning" style="margin-left: 8px;">🚨 ${node.gpu.throttle_reason}</span>`;
            }
            
            gpuHtml = `
                <div class="gpu-subsection neumorphic-recessed">
                    <div class="gpu-header">
                        <h4>GPU Accelerator (NVIDIA GB10) ${throttleBadge}</h4>
                        <span class="gpu-badge online">ONLINE</span>
                    </div>
                    <div class="gpu-hardware-grid">
                        <div class="heatmap-wrapper">
                            <canvas id="canvas-${nodeId}" width="160" height="80"></canvas>
                        </div>
                        <div class="gpu-hardware-metrics">
                            <div class="hw-metric">
                                <span class="label">Utilization:</span>
                                <span class="value font-tabular">${node.gpu.gpu_util}%</span>
                            </div>
                            <div class="hw-metric">
                                <span class="label">Temperature:</span>
                                <span class="value font-tabular">${node.gpu.temp}°C</span>
                            </div>
                            <div class="hw-metric">
                                <span class="label">Power Draw:</span>
                                <span class="value font-tabular">${node.gpu.power_draw}W / ${node.gpu.power_limit}W</span>
                            </div>
                        </div>
                    </div>
                    <div class="gpu-stat-full">
                        <div class="bar-row">
                            <span>VRAM Allocation</span>
                            <span class="font-tabular">${vramUsedGB}GB / ${vramTotalGB}GB</span>
                        </div>
                        <div class="mini-bar-well">
                            <div class="mini-bar-fill" style="width: ${vramPerc}%; background: linear-gradient(90deg, var(--glow-violet), var(--glow-orange));"></div>
                        </div>
                    </div>
                </div>
            `;
        } else {
            gpuHtml = `
                <div class="gpu-subsection neumorphic-recessed offline">
                    <div class="gpu-header">
                        <h4>GPU Accelerator</h4>
                        <span class="gpu-badge offline">NO GPU</span>
                    </div>
                    <p class="no-gpu-text">No active NVIDIA hardware detected or driver not loaded.</p>
                </div>
            `;
        }
        
        html += `
            <div class="node-card neumorphic-raised">
                <div class="node-card-header">
                    <h3>${nodeId}</h3>
                    <span class="node-badge online">ONLINE</span>
                </div>
                <div class="node-body">
                    <!-- System Performance Rows -->
                    <div class="sys-metrics">
                        <!-- CPU -->
                        <div class="sys-metric-bar">
                            <div class="bar-row">
                                <span>CPU Utilization</span>
                                <span class="font-tabular">${node.cpu}%</span>
                            </div>
                            <div class="mini-bar-well">
                                <div class="mini-bar-fill" style="width: ${node.cpu}%; background: var(--glow-orange);"></div>
                            </div>
                        </div>
                        <!-- RAM -->
                        <div class="sys-metric-bar">
                            <div class="bar-row">
                                <span>System RAM</span>
                                <span class="font-tabular">${ramUsedGB}GB / ${ramTotalGB}GB (${ramPerc}%)</span>
                            </div>
                            <div class="mini-bar-well">
                                <div class="mini-bar-fill" style="width: ${ramPerc}%; background: var(--glow-violet);"></div>
                            </div>
                        </div>
                        <!-- Disk -->
                        <div class="sys-metric-bar">
                            <div class="bar-row">
                                <span>Disk space (/)</span>
                                <span class="font-tabular">${node.disk.used}GB / ${node.disk.total}GB (${node.disk.perc}%)</span>
                            </div>
                            <div class="mini-bar-well">
                                <div class="mini-bar-fill" style="width: ${node.disk.perc}%; background: #00e676;"></div>
                            </div>
                        </div>
                    </div>
                    
                    <!-- GPU Stats -->
                    ${gpuHtml}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html;
    
    // Animate and draw canvases
    for (const nodeId in nodes) {
        const node = nodes[nodeId];
        if (node.online && node.gpu.online) {
            const canvas = document.getElementById(`canvas-${nodeId}`);
            const grid = getOrCreateGrid(nodeId);
            updateHeatmap(canvas, grid, node.gpu.temp, node.gpu.gpu_util);
        }
    }
}

function renderMemoryHogs(nodes) {
    const tbody = document.getElementById("hogs-table-body");
    if (!tbody) return;
    
    let rowsHtml = "";
    let allHogs = [];
    
    for (const nodeId in nodes) {
        const node = nodes[nodeId];
        if (node.online && node.hogs && node.hogs.length > 0) {
            node.hogs.forEach(h => {
                allHogs.push({
                    nodeId: nodeId,
                    name: h.name,
                    pid: h.pid,
                    mem: h.mem
                });
            });
        }
    }
    
    // Sort hogs globally by RAM usage descending
    allHogs.sort((a, b) => b.mem - a.mem);
    
    if (allHogs.length === 0) {
        tbody.innerHTML = `<tr><td colspan="4" class="empty-state">No process data available.</td></tr>`;
        return;
    }
    
    // Show top 8 hogs
    allHogs.slice(0, 8).forEach(h => {
        rowsHtml += `
            <tr>
                <td><span class="node-label-small">${h.nodeId}</span></td>
                <td><span class="mono-text">${h.name}</span></td>
                <td class="font-tabular font-dim">${h.pid}</td>
                <td class="text-right font-tabular highlight-val">${h.mem}%</td>
            </tr>
        `;
    });
    
    tbody.innerHTML = rowsHtml;
}

function renderControlCenter(nodes) {
    const container = document.getElementById("apps-container");
    if (!container) return;
    
    let html = "";
    
    for (const nodeId in nodes) {
        const node = nodes[nodeId];
        if (!node.online) continue;
        
        let dockerCards = "";
        if (node.dockers && node.dockers.length > 0) {
            node.dockers.forEach(d => {
                const ramUsed = d.mem_usage.includes('/') ? d.mem_usage.split('/')[0].trim() : d.mem_usage;
                const totalRam = d.mem_usage.includes('/') ? d.mem_usage.split('/')[1].trim() : '';
                const ramLabel = totalRam ? `${ramUsed} / ${totalRam}` : ramUsed;
                
                dockerCards += `
                    <div class="docker-card neumorphic-recessed">
                        <div class="docker-card-header">
                            <span class="docker-app-name" title="${d.name}">${d.name}</span>
                            <span class="status-indicator-dot ${d.state === "running" ? "online" : "offline"}"></span>
                        </div>
                        <div class="docker-card-body">
                            <div class="docker-meta">
                                <span class="docker-image" title="${d.image}">${d.image.split(':')[0]}</span>
                                <span class="docker-status font-dim">${d.status}</span>
                            </div>
                            ${d.state === "running" ? `
                                <div class="docker-resource-bars">
                                    <div class="resource-bar-row">
                                        <span>CPU: <span class="mono-num">${d.cpu_perc}</span></span>
                                        <span>RAM: <span class="mono-num">${ramLabel}</span></span>
                                    </div>
                                    <div class="mini-bar-well" style="margin-top: 4px;">
                                        <div class="mini-bar-fill" style="width: ${d.mem_perc}; background: var(--glow-violet);"></div>
                                    </div>
                                </div>
                            ` : `
                                <div class="docker-offline-text">Container Stopped</div>
                            `}
                        </div>
                        <div class="docker-card-footer">
                            <button class="action-btn log-btn" onclick="openLogStream('${nodeId}', 'docker', '${d.name}')">LOGS</button>
                            <button class="action-btn restart-btn" onclick="sendControlAction('container', '${nodeId}', '${d.name}', 'restart')">RESTART</button>
                            ${d.state === "running" 
                              ? `<button class="action-btn-danger stop-btn" onclick="sendControlAction('container', '${nodeId}', '${d.name}', 'stop')">KILL</button>`
                              : `<button class="action-btn start-btn" onclick="sendControlAction('container', '${nodeId}', '${d.name}', 'start')" style="color:var(--healthy)">START</button>`
                            }
                        </div>
                    </div>
                `;
            });
        } else {
            dockerCards = `<div class="empty-state-small">No Docker containers running or loaded.</div>`;
        }

        let serviceCards = "";
        const targetServices = ["ollama", "vllm", "hermes-gateway", "hermes-studio"];
        if (nodeId === "spark-8828" || nodeId === "spark-1dd6") {
            targetServices.forEach(s => {
                serviceCards += `
                    <div class="service-card neumorphic-recessed">
                        <div class="service-card-header">
                            <span class="service-name">${s}.service</span>
                            <span class="status-indicator-dot online"></span>
                        </div>
                        <div class="service-card-body">
                            <span class="service-desc font-dim">Systemd daemon</span>
                        </div>
                        <div class="service-card-footer">
                            <button class="action-btn log-btn" onclick="openLogStream('${nodeId}', 'service', '${s}')">LOGS</button>
                            <button class="action-btn restart-btn" onclick="sendControlAction('service', '${nodeId}', '${s}', 'restart')">RESTART</button>
                            <button class="action-btn-danger stop-btn" onclick="sendControlAction('service', '${nodeId}', '${s}', 'stop')">KILL</button>
                        </div>
                    </div>
                `;
            });
        }
        
        html += `
            <div class="node-control-card neumorphic-raised">
                <div class="control-card-header">
                    <h3>${nodeId} App Controls</h3>
                </div>
                <div class="control-card-body">
                    <div class="subset-title">Docker Containers</div>
                    <div class="docker-cards-grid">
                        ${dockerCards}
                    </div>
                    
                    ${serviceCards ? `
                        <div class="subset-title" style="margin-top:24px;">System Services</div>
                        <div class="service-cards-grid">
                            ${serviceCards}
                        </div>
                    ` : ""}
                </div>
            </div>
        `;
    }
    
    container.innerHTML = html || `<div class="empty-state">No active nodes to manage apps.</div>`;
}

function updateQueueMetrics(queue, vllm) {
    // 1. Update queue metrics numbers
    const activeTasksCount = queue.active ? queue.active.length : 0;
    const queuedTasksCount = queue.completed ? queue.completed.filter(t => t.status === "queued" || t.status === "waiting").length : 0; // wait, queued matches active tasks waiting
    
    let totalWaiting = 0;
    let totalRunning = 0;
    
    // Look into vllm metrics
    for (const m in vllm) {
        totalWaiting += vllm[m].waiting_requests || 0;
        totalRunning += vllm[m].running_requests || 0;
    }
    
    document.getElementById("running-reqs").textContent = totalRunning || activeTasksCount;
    document.getElementById("waiting-reqs").textContent = totalWaiting || queuedTasksCount;
    
    // 2. Render dynamic vLLM instances KV caches
    const cachesContainer = document.getElementById("vllm-caches-container");
    if (cachesContainer) {
        let cacheHtml = "";
        for (const modelName in vllm) {
            const metrics = vllm[modelName];
            const cachePerc = metrics.kv_cache_usage || 0.0;
            const statusText = metrics.online ? `${cachePerc.toFixed(1)}%` : "OFFLINE";
            const barWidth = metrics.online ? `${cachePerc}%` : "0%";
            
            cacheHtml += `
                <div class="cache-progress-container" style="margin-top: 10px;">
                    <div class="cache-labels">
                        <span class="cache-title">${modelName} Cache</span>
                        <span class="cache-perc" style="color: ${metrics.online ? 'var(--glow-orange)' : 'var(--danger)'}">${statusText}</span>
                    </div>
                    <div class="progress-bar-well neumorphic-recessed">
                        <div class="progress-bar-fill" style="width: ${barWidth}; background: linear-gradient(90deg, var(--glow-violet), var(--glow-orange));"></div>
                    </div>
                </div>
            `;
        }
        if (Object.keys(vllm).length === 0) {
            cacheHtml = `<div class="empty-state-small">vLLM instances offline.</div>`;
        }
        cachesContainer.innerHTML = cacheHtml;
    }
    
    // 3. Render active queue tasks with cancel button
    const jobsList = document.getElementById("jobs-list");
    if (jobsList) {
        let jobsHtml = "";
        if (queue.active && queue.active.length > 0) {
            queue.active.forEach(j => {
                // Task structure from FastAPI Control layer task.to_dict()
                const model = j.model || "Hermes-70B";
                const taskId = j.task_id || j.id;
                const status = j.status || "processing";
                
                jobsHtml += `
                    <div class="job-item neumorphic-recessed">
                        <div class="job-details">
                            <span class="job-model">${model}</span>
                            <span class="job-id font-dim">ID: ${taskId.substring(0, 8)}...</span>
                            <span class="job-status font-dim">[${status.toUpperCase()}]</span>
                        </div>
                        <button class="cancel-job-btn neumorphic-raised" onclick="cancelQueueTask('${taskId}')">CANCEL</button>
                    </div>
                `;
            });
        } else {
            jobsHtml = `<div class="empty-state">No active queue tasks.</div>`;
        }
        jobsList.innerHTML = jobsHtml;
    }
}

function checkKernelAlarms(nodes) {
    const alarmBanner = document.getElementById("kernel-alarm");
    const alarmDesc = document.getElementById("kernel-alarm-desc");
    if (!alarmBanner) return;
    
    let activeAlarm = null;
    
    for (const nodeId in nodes) {
        const node = nodes[nodeId];
        if (node.online && node.oom_events && node.oom_events.length > 0) {
            // Check the latest event
            const latest = node.oom_events[node.oom_events.length - 1];
            const logText = `[${nodeId}] ${latest.text}`;
            
            // Check if user already dismissed this exact alarm text
            if (!dismissedAlarms.has(logText)) {
                activeAlarm = {
                    node: nodeId,
                    type: latest.type, // oom or xid
                    text: latest.text,
                    fullText: logText
                };
                break; // Show the first new alarm found
            }
        }
    }
    
    if (activeAlarm) {
        alarmBanner.style.display = "flex";
        
        let typeLabel = activeAlarm.type === "xid" ? "NVIDIA Driver Xid Error" : "System RAM Out-Of-Memory (OOM)";
        alarmDesc.innerHTML = `<span style="color:var(--danger); font-weight:800;">${typeLabel}</span> on node <strong>${activeAlarm.node}</strong>: <br><code style="font-family:'JetBrains Mono'; font-size:0.85rem; color:#ffd8bf">${activeAlarm.text}</code>`;
    } else {
        alarmBanner.style.display = "none";
    }
}

async function sendControlAction(type, nodeId, name, action) {
    // type: container or service
    const verb = action === "stop" ? "KILL/STOP" : (action === "restart" ? "RESTART" : "START");
    if (!confirm(`Are you sure you want to ${verb} the ${type} "${name}" on node "${nodeId}"?`)) {
        return;
    }
    
    const url = type === "container" ? CONTROL_CONTAINER_URL : CONTROL_SERVICE_URL;
    const body = type === "container" 
        ? { node_id: nodeId, container_name: name, action: action }
        : { node_id: nodeId, service_name: name, action: action };
        
    try {
        const response = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        
        const resData = await response.json();
        if (response.ok) {
            alert(`Signal sent successfully! Result:\n${resData.result || "Command executed."}`);
            fetchTelemetry();
        } else {
            alert(`Error: ${resData.error || "Failed to execute control action."}`);
        }
    } catch (e) {
        alert("Failed to connect to backend telemetry service.");
        console.error(e);
    }
}

async function cancelQueueTask(taskId) {
    if (!confirm(`Are you sure you want to cancel and abort active job "${taskId}"?`)) {
        return;
    }
    
    try {
        const response = await fetch(CONTROL_CANCEL_TASK_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ task_id: taskId })
        });
        
        const resData = await response.json();
        if (response.ok) {
            alert("Cancellation command sent to queue router.");
            fetchTelemetry();
        } else {
            alert(`Error: ${resData.error || "Failed to cancel task."}`);
        }
    } catch (e) {
        alert("Failed to connect to telemetry service.");
    }
}

// Log modal routines
function openLogStream(nodeId, type, name) {
    activeLogTarget = { node_id: nodeId, type: type, name: name };
    
    const modal = document.getElementById("log-modal");
    const title = document.getElementById("log-modal-title-text");
    const term = document.getElementById("log-terminal-output");
    
    title.textContent = `[${nodeId}] ${type.toUpperCase()}: ${name} Logs`;
    term.textContent = "Connecting to log stream...";
    modal.style.display = "flex";
    
    // Fetch logs immediately
    fetchLogs();
    
    // Poll logs every 3 seconds while open
    if (logPollIntervalId) clearInterval(logPollIntervalId);
    logPollIntervalId = setInterval(fetchLogs, 3000);
}

async function fetchLogs() {
    if (!activeLogTarget) return;
    
    const term = document.getElementById("log-terminal-output");
    const { node_id, type, name } = activeLogTarget;
    
    try {
        const url = `${CONTROL_LOGS_URL}?node_id=${encodeURIComponent(node_id)}&type=${encodeURIComponent(type)}&name=${encodeURIComponent(name)}`;
        const response = await fetch(url);
        const data = await response.json();
        
        if (response.ok) {
            term.textContent = data.logs || "Empty log output.";
            // Scroll to bottom
            term.scrollTop = term.scrollHeight;
        } else {
            term.textContent = `Error loading logs: ${data.error || "Unknown telemetry error."}`;
        }
    } catch (e) {
        term.textContent = "Error: Failed to connect to log telemetry API endpoint.";
    }
}

function refreshActiveLogs() {
    fetchLogs();
}

function closeLogModal() {
    document.getElementById("log-modal").style.display = "none";
    activeLogTarget = null;
    if (logPollIntervalId) {
        clearInterval(logPollIntervalId);
        logPollIntervalId = null;
    }
}

async function restartVLLMService() {
    // Legacy support for loop reset button calling primary restart endpoint
    if (!confirm("Are you sure you want to force restart the vLLM service on the cluster? This will stop active inference for about 2 minutes.")) {
        return;
    }
    
    // Find endpoint host and trigger service restart for vllm
    sendControlAction("service", "spark-1dd6", "vllm", "restart");
}

// Close modal if clicking outside content
window.onclick = function(event) {
    const modal = document.getElementById("log-modal");
    if (event.target === modal) {
        closeLogModal();
    }
};

// Initial triggers
updateClock();
setInterval(updateClock, 1000);
fetchTelemetry();
setInterval(fetchTelemetry, POLL_INTERVAL);
