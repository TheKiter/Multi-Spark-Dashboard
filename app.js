/* app.js - Antigravity Spatial Telemetry Dashboard */

const API_URL = "/api/metrics";
const CONTROL_CONTAINER_URL = "/api/control/container";
const CONTROL_SERVICE_URL = "/api/control/service";
const CONTROL_LOGS_URL = "/api/control/logs";
const CONTROL_TASK_CANCEL_URL = "/api/control/task/cancel";

// Visual dynamic color and radial dial rendering helpers
function getGoodBadColor(percentage) {
    // 0% is good (green = 145), 100% is bad (red = 0)
    const hue = Math.max(0, 145 - (percentage * 1.45));
    return `hsl(${hue}, 90%, 50%)`;
}

function getStrongWeakColor(percentage) {
    // 0% is weak (orange = 30), 100% is strong (purple = 270)
    // Wrap backwards: 30 -> 0 -> 330 -> 300 -> 270
    let hue = 30 - (percentage * 1.2);
    if (hue < 0) hue += 360;
    return `hsl(${hue}, 95%, 55%)`;
}

// Inline SVG Icon components for standalone stability
const Icons = {
    Cpu: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect width="16" height="16" x="4" y="4" rx="2"/>
            <path d="M9 20v2M15 20v2M20 9h2M20 15h2M15 2v2M9 2v2M4 9H2M4 15H2M9 9h6v6H9z"/>
        </svg>
    ),
    Database: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <ellipse cx="12" cy="5" rx="9" ry="3"/>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>
        </svg>
    ),
    HardDrive: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect width="20" height="8" x="2" y="3" rx="2"/>
            <rect width="20" height="8" x="2" y="13" rx="2"/>
            <path d="M6 7h.01M6 17h.01"/>
            <path d="M20 7h.01M20 17h.01"/>
        </svg>
    ),
    Zap: () => (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
    ),
    Thermometer: () => (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
        </svg>
    ),
    Terminal: () => (
        <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="m5 17 5-5-5-5M12 19h8"/>
        </svg>
    ),
    Play: () => (
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
        </svg>
    ),
    Square: () => (
        <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
            <rect width="18" height="18" x="3" y="3" rx="2"/>
        </svg>
    ),
    RefreshCw: () => (
        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
            <path d="M16 16h5v5M3 3v5h5"/>
        </svg>
    ),
    AlertTriangle: () => (
        <svg className="w-5 h-5 text-amber-500" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
            <line x1="12" x2="12" y1="9" y2="13"/>
            <line x1="12" x2="12.01" y1="17" y2="17"/>
        </svg>
    ),
    Server: () => (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect width="20" height="8" x="2" y="2" rx="2" ry="2"/>
            <rect width="20" height="8" x="2" y="14" rx="2" ry="2"/>
            <line x1="6" x2="6.01" y1="6" y2="6"/>
            <line x1="6" x2="6.01" y1="18" y2="18"/>
        </svg>
    )
};

// Dial Gauge Component
const CircularGauge = ({ value, maxVal = 100, label, suffix = "%", colorFn }) => {
    const perc = Math.max(0, Math.min(100, Math.round((value / maxVal) * 100)));
    const color = colorFn(perc);
    
    return (
        <div className="gauge-item flex flex-col items-center gap-1.5 flex-1">
            <div className="circular-gauge relative w-16 h-16">
                <svg viewBox="0 0 36 36" className="circular-chart w-full h-full">
                    <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                    <path className="circle-fill" 
                          strokeDasharray={`${perc}, 100`} 
                          stroke={color} 
                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                </svg>
                <div className="gauge-center-text absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold font-mono text-slate-200">
                    {value}{suffix}
                </div>
            </div>
            <span className="gauge-label text-[9px] font-bold text-slate-400 tracking-wider uppercase">{label}</span>
        </div>
    );
};

// Main App component
const App = () => {
    const [metrics, setMetrics] = React.useState(null);
    const [is3d, setIs3d] = React.useState(true);
    const [logModal, setLogModal] = React.useState(null); // { node_id, type, name, logs }
    const [dismissedAlarms, setDismissedAlarms] = React.useState(new Set());
    const [clock, setClock] = React.useState("00:00:00");
    const [isUpdating, setIsUpdating] = React.useState(false);
    
    const cardGridRef = React.useRef(null);
    const logIntervalRef = React.useRef(null);

    // Clock lifecycle
    React.useEffect(() => {
        const timer = setInterval(() => {
            const now = new Date();
            setClock(now.toTimeString().split(' ')[0]);
        }, 1000);
        return () => clearInterval(timer);
    }, []);

    // Telemetry fetcher
    const fetchTelemetry = async () => {
        try {
            const res = await fetch(API_URL);
            if (!res.ok) throw new Error("API Offline");
            const data = await res.json();
            setMetrics(data);
        } catch (err) {
            console.error("Telemetry fetch error:", err);
        }
    };

    React.useEffect(() => {
        fetchTelemetry();
        const poll = setInterval(fetchTelemetry, 2500);
        return () => clearInterval(poll);
    }, []);

    // Staggered entry animation on load
    React.useEffect(() => {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (metrics && cardGridRef.current && !prefersReducedMotion) {
            const cards = cardGridRef.current.querySelectorAll('.gsap-card');
            if (cards.length > 0) {
                gsap.fromTo(cards, 
                    { opacity: 0, y: 50, rotateX: 15, scale: 0.95 },
                    { opacity: 1, y: 0, rotateX: 0, scale: 1, duration: 0.8, stagger: 0.08, ease: "power2.out" }
                );
            }
        }
    }, [metrics === null]); // runs only when metrics shifts from null to loaded

    // Logs Poller
    React.useEffect(() => {
        if (logModal) {
            const pollLogs = async () => {
                try {
                    const res = await fetch(`${CONTROL_LOGS_URL}?node_id=${logModal.node_id}&type=${logModal.type}&name=${logModal.name}`);
                    if (res.ok) {
                        const data = await res.json();
                        setLogModal(prev => prev ? { ...prev, logs: data.logs } : null);
                    }
                } catch (err) {
                    console.error("Logs error:", err);
                }
            };
            pollLogs();
            logIntervalRef.current = setInterval(pollLogs, 2000);
        } else {
            if (logIntervalRef.current) {
                clearInterval(logIntervalRef.current);
                logIntervalRef.current = null;
            }
        }
        return () => {
            if (logIntervalRef.current) clearInterval(logIntervalRef.current);
        };
    }, [logModal?.node_id, logModal?.type, logModal?.name]);

    // Handle Control action
    const sendControlAction = async (type, nodeId, name, action) => {
        const verb = action === "stop" ? "KILL/STOP" : (action === "restart" ? "RESTART" : "START");
        if (!confirm(`Are you sure you want to ${verb} the ${type} "${name}" on node "${nodeId.replace("spark-", "")}"?`)) {
            return;
        }
        
        setIsUpdating(true);
        const url = type === "container" ? CONTROL_CONTAINER_URL : CONTROL_SERVICE_URL;
        const body = type === "container" 
            ? { node_id: nodeId, container_name: name, action: action }
            : { node_id: nodeId, service_name: name, action: action };
            
        try {
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            if (res.ok) {
                await fetchTelemetry();
            } else {
                alert(`Action failed: ${res.statusText}`);
            }
        } catch (err) {
            alert(`Error: ${err.message}`);
        } finally {
            setIsUpdating(false);
        }
    };

    // Cancel FastAPI Task
    const cancelQueueTask = async (taskId) => {
        if (!confirm(`Are you sure you want to cancel FastAPI Queue Job: ${taskId}?`)) {
            return;
        }
        
        setIsUpdating(true);
        try {
            const res = await fetch(CONTROL_TASK_CANCEL_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ task_id: taskId })
            });
            if (res.ok) {
                await fetchTelemetry();
            } else {
                alert("Cancellation failed.");
            }
        } catch (err) {
            alert(`Error: ${err.message}`);
        } finally {
            setIsUpdating(false);
        }
    };

    // Helper to clear alarms
    const dismissAlarm = (logText) => {
        setDismissedAlarms(prev => {
            const updated = new Set(prev);
            updated.add(logText);
            return updated;
        });
    };

    if (!metrics) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <div className="inline-block w-10 h-10 border-4 border-t-purple-500 border-r-transparent border-b-purple-500 border-l-transparent rounded-full animate-spin"></div>
                    <div className="mt-4 text-purple-400 font-semibold tracking-wider">SYNCING WITH CLUSTER METRICS...</div>
                </div>
            </div>
        );
    }

    // Extract alarm events
    let activeAlarm = null;
    for (const nid in metrics.nodes) {
        const n = metrics.nodes[nid];
        if (n.online && n.oom_events && n.oom_events.length > 0) {
            const latest = n.oom_events[n.oom_events.length - 1];
            const logText = `[${nid}] ${latest.text}`;
            if (!dismissedAlarms.has(logText)) {
                activeAlarm = { node: nid, type: latest.type, text: latest.text, logText };
                break;
            }
        }
    }

    // Extract Loop alert
    let loopAlert = null;
    for (const nid in metrics.nodes) {
        const n = metrics.nodes[nid];
        if (n.online && n.chat_loop_diagnostics && n.chat_loop_diagnostics.is_looping) {
            loopAlert = {
                node: nid,
                score: Math.round(n.chat_loop_diagnostics.repetition_score * 100),
                prompt: n.chat_loop_diagnostics.latest_prompt,
                response: n.chat_loop_diagnostics.latest_response
            };
            break;
        }
    }

    // Sort global memory hogs
    let globalHogs = [];
    for (const nid in metrics.nodes) {
        const n = metrics.nodes[nid];
        if (n.online && n.hogs) {
            n.hogs.forEach(h => {
                globalHogs.push({ nodeId: nid, ...h });
            });
        }
    }
    globalHogs.sort((a, b) => b.mem - a.mem);

    // Compute active queue sums
    let totalRunning = 0;
    let totalWaiting = 0;
    for (const m in metrics.vllm) {
        totalWaiting += metrics.vllm[m].waiting_requests || 0;
        totalRunning += metrics.vllm[m].running_requests || 0;
    }
    const queueActiveCount = metrics.queue.active ? metrics.queue.active.length : 0;
    const queueWaitingCount = metrics.queue.completed ? metrics.queue.completed.filter(t => t.status === "queued" || t.status === "waiting").length : 0;

    return (
        <div className="max-w-[1440px] mx-auto p-6 md:p-8 flex flex-col gap-6 relative z-10">
            {/* Header */}
            <header className="glass-panel px-6 py-4 flex flex-wrap justify-between items-center gap-4 transition-transform duration-300">
                <div className="flex items-center gap-3">
                    <span className="w-3 h-3 bg-purple-500 rounded-full shadow-[0_0_10px_#8c00ff] animate-pulse"></span>
                    <h1 className="text-xl font-bold tracking-wider text-slate-100 bg-clip-text text-transparent bg-gradient-to-r from-slate-100 to-slate-400">
                        SPARK CLUSTER TELEMETRY
                    </h1>
                </div>
                
                <div className="flex items-center gap-6">
                    <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 bg-green-500 rounded-full shadow-[0_0_8px_#22c55e]"></span>
                        <span className="text-xs font-semibold uppercase text-slate-300">SYSTEMS SYNCED</span>
                    </div>
                    
                    <span className="font-mono text-sm text-slate-400 tracking-widest">{clock}</span>
                    
                    {/* 3D Isometric View Toggle */}
                    <button onClick={() => setIs3d(!is3d)} 
                            className={`px-4 py-1.5 text-xs font-bold rounded-lg border transition-all duration-300 active:scale-95 flex items-center gap-2 ${
                                is3d 
                                ? 'bg-purple-600/20 border-purple-500/30 text-purple-400 shadow-[0_0_12px_rgba(140,0,255,0.15)]' 
                                : 'bg-slate-800/40 border-slate-700/50 text-slate-400'
                            }`}>
                        <i data-lucide="server" className="w-3.5 h-3.5"><Icons.Server /></i>
                        {is3d ? "3D ANGLE: ON" : "3D ANGLE: OFF"}
                    </button>
                </div>
            </header>

            {/* Loop Alert Banner */}
            {loopAlert && (
                <div className="glass-panel border-amber-500/20 bg-amber-950/20 p-5 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-[float_4s_ease-in-out_infinite]">
                    <div className="flex items-start gap-3">
                        <Icons.AlertTriangle />
                        <div>
                            <strong className="text-amber-400 text-sm tracking-wide">LOOP WARNING SYSTEM DETECTED INFINITE REPETITION</strong>
                            <p className="text-xs text-slate-300 mt-1">
                                Uniqueness score dropped to <span className="text-amber-400 font-bold">{loopAlert.score}%</span> on node <strong>{loopAlert.node.replace("spark-", "")}</strong>.
                            </p>
                        </div>
                    </div>
                    <button onClick={() => sendControlAction('service', loopAlert.node, 'vllm', 'restart')} 
                            className="bg-amber-600 hover:bg-amber-500 text-slate-950 text-xs font-extrabold px-5 py-2.5 rounded-lg active:scale-95 transition-all shadow-lg shadow-amber-600/10">
                        FORCE RESET vLLM INSTANCE
                    </button>
                </div>
            )}

            {/* Kernel / OOM Alarm Banner */}
            {activeAlarm && (
                <div className="glass-panel border-red-500/20 bg-red-950/20 p-5 flex justify-between items-start gap-4">
                    <div className="flex items-start gap-3">
                        <Icons.AlertTriangle />
                        <div>
                            <strong className="text-red-400 text-sm tracking-wide">
                                {activeAlarm.type === "xid" ? "NVIDIA KERNEL EXCEPTION (XID)" : "OUT OF MEMORY (OOM) KILLER EVENT"}
                            </strong>
                            <p className="text-xs text-slate-300 mt-1.5 leading-relaxed font-mono">
                                Node <strong>{activeAlarm.node.replace("spark-", "")}</strong>: <br/>
                                <span className="text-red-300/80">{activeAlarm.text}</span>
                            </p>
                        </div>
                    </div>
                    <button onClick={() => dismissAlarm(activeAlarm.logText)} 
                            className="bg-red-600/30 hover:bg-red-600/40 text-red-300 border border-red-500/20 text-xs font-bold px-4 py-2 rounded-lg active:scale-95 transition-all">
                        DISMISS
                    </button>
                </div>
            )}

            {/* Cluster Node Dials Grid */}
            <section className="perspective-container relative z-20">
                <div ref={cardGridRef} className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 isometric-grid ${is3d ? "active-3d" : ""}`}>
                    {Object.keys(metrics.nodes).map(nodeId => {
                        const node = metrics.nodes[nodeId];
                        const cleanId = nodeId.replace("spark-", "");
                        
                        if (!node.online) {
                            return (
                                <div key={nodeId} className="node-card-3d gsap-card glass-panel opacity-65 flex flex-col justify-center items-center h-[280px] p-6 text-center border-slate-800 bg-slate-950/25">
                                    <span className="w-12 h-12 rounded-full border border-red-500/20 bg-red-500/5 text-red-500 flex items-center justify-center mb-3">
                                        <Icons.AlertTriangle />
                                    </span>
                                    <h3 className="text-lg font-bold text-slate-400 uppercase tracking-widest">{cleanId}</h3>
                                    <p className="text-xs text-slate-500 mt-1.5 max-w-[200px]">Node unreachable. Verify Tailscale/SSH keys.</p>
                                </div>
                            );
                        }

                        const ramPerc = node.ram.total ? Math.round((node.ram.used / node.ram.total) * 100) : 0;
                        const swapTotal = node.ram.swap_total || 0;
                        const swapUsed = node.ram.swap_used || 0;
                        const swapPerc = swapTotal ? Math.round((swapUsed / swapTotal) * 100) : 0;
                        
                        const iowaitVal = node.iowait || 0.0;
                        const readRate = node.disk.read_rate || 0.0;
                        const writeRate = node.disk.write_rate || 0.0;
                        const swapIn = (node.swap_rates && node.swap_rates.in) || 0.0;
                        const swapOut = (node.swap_rates && node.swap_rates.out) || 0.0;
                        const psiSome = (node.psi_memory && node.psi_memory.some_avg10) || 0.0;

                        // Pressure flags
                        let isSwapping = swapIn > 0.5 || swapOut > 0.5;
                        let isThrashing = iowaitVal > 8.0;
                        let isMemorySaturated = psiSome > 10.0;

                        // GPU prep
                        let gpuBlock = null;
                        if (node.gpu && node.gpu.online) {
                            const vramPerc = node.gpu.mem_total ? Math.round((node.gpu.mem_used / node.gpu.mem_total) * 100) : 0;
                            const powerLimit = node.gpu.power_limit || 300;
                            
                            gpuBlock = (
                                <div className="border-t border-white/5 pt-4 mt-4">
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="text-[10px] font-bold text-purple-400 tracking-widest uppercase">GPU Core telemetry</span>
                                        {node.gpu.throttle_reason && node.gpu.throttle_reason !== "None" && (
                                            <span className="text-[8px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-2 py-0.5 rounded pulsing-badge">
                                                🚨 {node.gpu.throttle_reason}
                                            </span>
                                        )}
                                    </div>
                                    <div className="flex gap-2 justify-between">
                                        {CircularGauge({ value: node.gpu.gpu_util, label: 'LOAD', colorFn: getGoodBadColor })}
                                        {CircularGauge({ value: node.gpu.temp, maxVal: 100, label: 'TEMP', suffix: "°C", colorFn: getGoodBadColor })}
                                        {CircularGauge({ value: node.gpu.power_draw, maxVal: powerLimit, label: 'POWER', suffix: "W", colorFn: getStrongWeakColor })}
                                        {CircularGauge({ value: vramPerc, label: 'VRAM', colorFn: getStrongWeakColor })}
                                    </div>
                                </div>
                            );
                        } else {
                            gpuBlock = (
                                <div className="border-t border-white/5 pt-4 mt-4 flex items-center justify-center py-4 text-center">
                                    <p className="text-[10px] font-bold tracking-widest text-slate-600 uppercase">GPU ACCELERATOR OFF</p>
                                </div>
                            );
                        }

                        return (
                            <div key={nodeId} className="node-card-3d gsap-card glass-panel p-5 relative flex flex-col justify-between border-white/5 bg-slate-950/20">
                                {/* Header */}
                                <div className="flex justify-between items-start mb-4">
                                    <div>
                                        <h3 className="text-lg font-bold text-slate-100 tracking-wider flex items-center gap-2">
                                            {cleanId}
                                            {isMemorySaturated && <span className="text-[8px] bg-red-500/15 border border-red-500/20 text-red-400 px-1.5 py-0.5 rounded tracking-wide font-mono">PSI ALERT</span>}
                                            {isSwapping && <span className="text-[8px] bg-amber-500/15 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 rounded tracking-wide pulsing-badge">SWAP PAGING</span>}
                                            {isThrashing && <span className="text-[8px] bg-red-500/15 border border-red-500/20 text-red-400 px-1.5 py-0.5 rounded tracking-wide">THRASHING</span>}
                                        </h3>
                                    </div>
                                    <span className="text-[9px] bg-green-500/10 border border-green-500/20 text-green-400 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider">ONLINE</span>
                                </div>

                                {/* System Radial Dials */}
                                <div className="flex gap-2 justify-between mb-4">
                                    {CircularGauge({ value: node.cpu, label: 'CPU', colorFn: getGoodBadColor })}
                                    {CircularGauge({ value: ramPerc, label: 'RAM', colorFn: getGoodBadColor })}
                                    {swapTotal > 0 && CircularGauge({ value: swapPerc, label: 'SWAP', colorFn: getGoodBadColor })}
                                    {CircularGauge({ value: node.disk.perc, label: 'DISK', colorFn: getGoodBadColor })}
                                </div>

                                {/* Micro Details */}
                                <div className="border-t border-white/5 pt-3 text-[10px] font-mono text-slate-400 flex flex-col gap-2">
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-slate-900/35 p-2 rounded-lg border border-white/5">
                                        <div>I/O Wait: <span className="text-slate-200 font-bold">{iowaitVal}%</span></div>
                                        <div>Mem PSI: <span className="text-slate-200 font-bold">{psiSome}%</span></div>
                                        <div>RAM: <span className="text-slate-200 font-bold">{(node.ram.used/1024).toFixed(0)}/{(node.ram.total/1024).toFixed(0)} GB</span></div>
                                        {swapTotal > 0 && <div>Swap: <span className="text-slate-200 font-bold">{(swapUsed/1024).toFixed(0)}/{(swapTotal/1024).toFixed(0)} GB</span></div>}
                                    </div>
                                    <div className="flex justify-between px-1">
                                        <span>Read: <span className="text-slate-200 font-bold">{readRate >= 1024 ? `${(readRate/1024).toFixed(1)} MB/s` : `${readRate.toFixed(0)} KB/s`}</span></span>
                                        <span>Write: <span className="text-slate-200 font-bold">{writeRate >= 1024 ? `${(writeRate/1024).toFixed(1)} MB/s` : `${writeRate.toFixed(0)} KB/s`}</span></span>
                                    </div>
                                </div>

                                {/* GPU subsection */}
                                {gpuBlock}
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Dashboard Lower Stack - Queue, Logs, & App Control */}
            <main ref={cardGridRef} className="grid grid-cols-1 lg:grid-cols-3 gap-6 relative z-10">
                {/* Col 1: Queue and vLLM cache */}
                <section className="gsap-card glass-panel p-6 border-white/5 bg-slate-950/20 flex flex-col gap-5">
                    <h2 className="text-sm font-bold tracking-widest text-slate-400 uppercase flex items-center gap-2">
                        <Icons.Database />
                        QUEUE & VRAM CACHE
                    </h2>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-slate-900/40 border border-white/5 p-3.5 rounded-xl text-center">
                            <span className="block text-[10px] font-bold text-slate-500 tracking-wider uppercase">ACTIVE TASKS</span>
                            <span className="block text-2xl font-mono font-bold text-purple-400 mt-1">{totalRunning || queueActiveCount}</span>
                        </div>
                        <div className="bg-slate-900/40 border border-white/5 p-3.5 rounded-xl text-center">
                            <span className="block text-[10px] font-bold text-slate-500 tracking-wider uppercase">QUEUED TASKS</span>
                            <span className="block text-2xl font-mono font-bold text-amber-500 mt-1">{totalWaiting || queueWaitingCount}</span>
                        </div>
                    </div>

                    {/* KV Cache bars */}
                    <div className="flex flex-col gap-3">
                        <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">vLLM KV Cache Allocation</span>
                        {Object.keys(metrics.vllm).map(modelName => {
                            const v = metrics.vllm[modelName];
                            const width = v.online ? `${v.kv_cache_usage}%` : "0%";
                            return (
                                <div key={modelName} className="bg-slate-900/35 border border-white/5 p-3 rounded-xl flex flex-col gap-2">
                                    <div className="flex justify-between items-center text-[10px] font-bold font-mono">
                                        <span className="text-slate-300">{modelName}</span>
                                        <span className={v.online ? "text-purple-400" : "text-red-400"}>{v.online ? `${v.kv_cache_usage.toFixed(1)}%` : "OFFLINE"}</span>
                                    </div>
                                    <div className="h-2 w-full bg-slate-950 rounded-full overflow-hidden border border-white/5">
                                        <div className="h-full bg-gradient-to-r from-purple-600 to-amber-500 rounded-full transition-[width] duration-700 ease-out" style={{ width }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Active Jobs Queue */}
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">Active Pipeline Tasks</span>
                        <div className="max-h-[140px] overflow-y-auto pr-1 flex flex-col gap-2 custom-scrollbar">
                            {metrics.queue.active && metrics.queue.active.length > 0 ? (
                                metrics.queue.active.map(job => (
                                    <div key={job.task_id || job.id} className="bg-slate-900/30 border border-white/5 px-3 py-2.5 rounded-xl flex justify-between items-center text-[10px]">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-bold text-slate-200">{job.model || "Hermes-70B"}</span>
                                            <span className="font-mono text-slate-500">ID: {(job.task_id || job.id).substring(0, 8)}...</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-mono font-bold text-purple-400 uppercase">[{job.status}]</span>
                                            <button onClick={() => cancelQueueTask(job.task_id || job.id)} 
                                                    className="px-2.5 py-1.5 bg-red-950/20 hover:bg-red-950/45 border border-red-500/20 hover:border-red-500/40 text-red-400 rounded-md font-bold transition-all duration-200">
                                                CANCEL
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center text-xs text-slate-600 py-6">No jobs currently executing in the queue.</div>
                            )}
                        </div>
                    </div>
                </section>

                {/* Col 2: AI Loop Diagnostics */}
                <section className="gsap-card glass-panel p-6 border-white/5 bg-slate-950/20 flex flex-col gap-5 justify-between">
                    <div className="flex flex-col gap-4">
                        <h2 className="text-sm font-bold tracking-widest text-slate-400 uppercase flex items-center gap-2">
                            <Icons.Cpu />
                            AI REPETITION DIAGNOSTICS
                        </h2>
                        
                        <div className="flex flex-col items-center py-4 bg-slate-900/20 border border-white/5 rounded-2xl relative">
                            {/* Circular Gauge showing n-gram Uniqueness */}
                            {Object.keys(metrics.nodes).map(nid => {
                                const n = metrics.nodes[nid];
                                if (n.online && n.chat_loop_diagnostics) {
                                    const score = Math.round(n.chat_loop_diagnostics.repetition_score * 100);
                                    return (
                                        <div key={nid} className="flex flex-col items-center gap-3">
                                            <div className="w-24 h-24 relative">
                                                <svg viewBox="0 0 36 36" className="circular-chart w-full h-full">
                                                    <path className="circle-bg fill-none stroke-slate-800/40 stroke-[2.5]" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                                    <path className="circle-fill fill-none stroke-[2.5] stroke-linecap-round transition-[stroke-dasharray] duration-1000" 
                                                          strokeDasharray={`${score}, 100`} 
                                                          stroke={getGoodBadColor(score)} 
                                                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                                </svg>
                                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                                                    <span className="block text-lg font-bold font-mono text-slate-200">{score}%</span>
                                                    <span className="block text-[7px] text-slate-500 font-bold uppercase tracking-wide">Entropy</span>
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-bold tracking-wider text-slate-500 uppercase">
                                                4-gram Repetition Metric
                                            </span>
                                        </div>
                                    );
                                }
                            })}
                        </div>
                    </div>

                    {/* Code Stream Screen */}
                    <div className="flex flex-col gap-2">
                        <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase flex items-center gap-1">
                            <Icons.Terminal />
                            Live Inference Stream
                        </span>
                        {Object.keys(metrics.nodes).map(nid => {
                            const n = metrics.nodes[nid];
                            if (n.online && n.chat_loop_diagnostics) {
                                return (
                                    <div key={nid} className="terminal-screen p-3 rounded-xl border border-white/5 font-mono text-[10px] flex flex-col gap-2">
                                        <div className="flex flex-col gap-1 max-h-[85px] overflow-y-auto custom-scrollbar">
                                            <span className="text-purple-400 font-bold">USER:</span>
                                            <p className="text-slate-300 leading-normal bg-slate-950/40 p-2 rounded border border-white/5 select-all">{n.chat_loop_diagnostics.latest_prompt || "Idle..."}</p>
                                        </div>
                                        <div className="flex flex-col gap-1 max-h-[105px] overflow-y-auto custom-scrollbar border-t border-white/5 pt-2">
                                            <span className="text-amber-500 font-bold">GENERATION:</span>
                                            <p className="text-slate-300 leading-normal bg-slate-950/40 p-2 rounded border border-white/5 select-all">{n.chat_loop_diagnostics.latest_response || "Waiting..."}</p>
                                        </div>
                                    </div>
                                );
                            }
                        })}
                    </div>
                </section>

                {/* Col 3: App Controls & Services */}
                <section className="gsap-card glass-panel p-6 border-white/5 bg-slate-950/20 flex flex-col gap-4">
                    <h2 className="text-sm font-bold tracking-widest text-slate-400 uppercase flex items-center gap-2">
                        <Icons.Terminal />
                        MICROSERVICE CONTROL CENTER
                    </h2>
                    
                    <div className="flex flex-col gap-4 max-h-[440px] overflow-y-auto pr-1 custom-scrollbar">
                        {Object.keys(metrics.nodes).map(nodeId => {
                            const node = metrics.nodes[nodeId];
                            if (!node.online) return null;
                            const cleanId = nodeId.replace("spark-", "");
                            
                            return (
                                <div key={nodeId} className="flex flex-col gap-3">
                                    <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest border-b border-white/5 pb-1">
                                        Node {cleanId} Processes
                                    </div>
                                    
                                    {/* Docker container cards inside this host */}
                                    {node.dockers && node.dockers.length > 0 ? (
                                        <div className="flex flex-col gap-2">
                                            {node.dockers.map(d => {
                                                const ramUsed = d.mem_usage.includes('/') ? d.mem_usage.split('/')[0].trim() : d.mem_usage;
                                                const totalRam = d.mem_usage.includes('/') ? d.mem_usage.split('/')[1].trim() : '';
                                                const ramLabel = totalRam ? `${ramUsed} / ${totalRam}` : ramUsed;
                                                const isRunning = d.state === "running";
                                                
                                                return (
                                                    <div key={d.name} className="bg-slate-900/35 border border-white/5 p-3 rounded-xl flex flex-col gap-2.5">
                                                        <div className="flex justify-between items-center text-[10px]">
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="font-bold text-slate-200">{d.name}</span>
                                                                <span className="text-[9px] text-slate-500 font-mono leading-none truncate max-w-[130px]" title={d.image}>{d.image.split(':')[0]}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className={`w-2 h-2 rounded-full ${isRunning ? "bg-green-500 shadow-[0_0_6px_#22c55e]" : "bg-red-500 shadow-[0_0_6px_#ef4444]"}`}></span>
                                                                <span className="font-mono text-slate-400 leading-none">{d.status}</span>
                                                            </div>
                                                        </div>
                                                        
                                                        {isRunning && (
                                                            <div className="bg-slate-950/45 p-2 rounded-lg border border-white/5 text-[9px] font-mono text-slate-400 flex justify-between items-center">
                                                                <span>CPU: <span className="text-slate-200 font-bold">{d.cpu_perc}</span></span>
                                                                <span>RAM: <span className="text-slate-200 font-bold">{ramLabel}</span></span>
                                                            </div>
                                                        )}
                                                        
                                                        <div className="flex gap-2 border-t border-white/5 pt-2 justify-between">
                                                            <button onClick={() => setLogModal({ node_id: nodeId, type: "docker", name: d.name, logs: "Loading logs..." })} 
                                                                    className="flex-1 py-1 text-[9px] font-bold bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700/50 hover:border-slate-600/50 text-slate-300 rounded active:scale-95 transition-transform duration-100 uppercase">
                                                                Logs
                                                            </button>
                                                            <button onClick={() => sendControlAction('container', nodeId, d.name, 'restart')} 
                                                                    className="flex-1 py-1 text-[9px] font-bold bg-slate-800/40 hover:bg-slate-800/60 border border-slate-700/50 hover:border-slate-600/50 text-amber-400 rounded active:scale-95 transition-transform duration-100 uppercase">
                                                                Restart
                                                            </button>
                                                            {isRunning ? (
                                                                <button onClick={() => sendControlAction('container', nodeId, d.name, 'stop')} 
                                                                        className="flex-1 py-1 text-[9px] font-bold bg-red-950/15 hover:bg-red-950/35 border border-red-500/10 hover:border-red-500/30 text-red-400 rounded active:scale-95 transition-transform duration-100 uppercase">
                                                                    Kill
                                                                </button>
                                                            ) : (
                                                                <button onClick={() => sendControlAction('container', nodeId, d.name, 'start')} 
                                                                        className="flex-1 py-1 text-[9px] font-bold bg-green-950/15 hover:bg-green-950/35 border border-green-500/10 hover:border-green-500/30 text-green-400 rounded active:scale-95 transition-transform duration-100 uppercase">
                                                                    Start
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-[10px] text-slate-600 italic">No Docker workloads.</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            </main>

            {/* Log Stream Modal Panel */}
            {logModal && (
                <div className="fixed inset-0 bg-spaceDark/65 backdrop-blur-xl z-50 flex items-center justify-center p-4 md:p-6 transition-all duration-300">
                    <div className="glass-panel w-full max-w-[800px] border-white/5 bg-slate-950/80 shadow-[0_30px_60px_rgba(0,0,0,0.6)] flex flex-col h-[520px] overflow-hidden">
                        {/* Modal Header */}
                        <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center bg-slate-900/30">
                            <div className="flex items-center gap-3">
                                <span className="w-2 h-2 bg-purple-500 rounded-full animate-ping"></span>
                                <h3 className="text-xs font-bold tracking-widest text-slate-200 uppercase font-mono">
                                    [LOG STREAM] {logModal.node_id.replace("spark-", "")} // {logModal.name}
                                </h3>
                            </div>
                            <button onClick={() => setLogModal(null)} 
                                    className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-bold rounded-lg border border-slate-700/50 hover:border-slate-600 active:scale-95 transition-all">
                                CLOSE
                            </button>
                        </div>
                        {/* Terminal Screen Body */}
                        <div className="flex-1 p-4 overflow-y-auto font-mono text-[10px] text-slate-300 leading-relaxed bg-slate-950/90 custom-scrollbar select-all">
                            {logModal.logs ? (
                                <pre className="whitespace-pre-wrap">{logModal.logs}</pre>
                            ) : (
                                <div className="flex items-center justify-center h-full">
                                    <div className="w-5 h-5 border-2 border-t-purple-500 border-r-transparent border-b-purple-500 border-l-transparent rounded-full animate-spin"></div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// Render React to Root
const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
