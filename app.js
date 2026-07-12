/* app.js - Serenity Spa Cluster Telemetry Dashboard */

const API_URL = "/api/metrics";
const CONTROL_CONTAINER_URL = "/api/control/container";
const CONTROL_SERVICE_URL = "/api/control/service";
const CONTROL_LOGS_URL = "/api/control/logs";
const CONTROL_TASK_CANCEL_URL = "/api/control/task/cancel";

// Calm spa-themed HSL color interpolation
function getGoodBadColor(percentage) {
    // Calming Sage Green HSL(120, 18%, 60%) to Soft Terracotta Coral HSL(0, 50%, 65%)
    const h = Math.max(0, 120 - (percentage * 1.2)); // 120 down to 0
    const s = 18 + (percentage * 0.32); // 18% up to 50%
    const l = 60 + (percentage * 0.05); // 60% up to 65%
    return `hsl(${h}, ${s}%, ${l}%)`;
}

function getStrongWeakColor(percentage) {
    // Calm Gold HSL(40, 50%, 56%) to Rose Gold HSL(350, 55%, 70%)
    const h = 40 + (percentage * 3.1); // 40 up to 350 (degrees)
    const s = 50 + (percentage * 0.05);
    const l = 56 + (percentage * 0.14);
    return `hsl(${h}, ${s}%, ${l}%)`;
}

// Inline SVG Icon components for stability
const Icons = {
    Cpu: () => (
        <svg className="w-4 h-4 opacity-75" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect width="16" height="16" x="4" y="4" rx="2"/>
            <path d="M9 20v2M15 20v2M20 9h2M20 15h2M15 2v2M9 2v2M4 9H2M4 15H2M9 9h6v6H9z"/>
        </svg>
    ),
    Database: () => (
        <svg className="w-4 h-4 opacity-75" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <ellipse cx="12" cy="5" rx="9" ry="3"/>
            <path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
            <path d="M3 12c0 1.66 4 3 9 3s9-1.34 9-3"/>
        </svg>
    ),
    HardDrive: () => (
        <svg className="w-4 h-4 opacity-75" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <rect width="20" height="8" x="2" y="3" rx="2"/>
            <rect width="20" height="8" x="2" y="13" rx="2"/>
            <path d="M6 7h.01M6 17h.01"/>
            <path d="M20 7h.01M20 17h.01"/>
        </svg>
    ),
    Zap: () => (
        <svg className="w-3.5 h-3.5 opacity-70" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
        </svg>
    ),
    Thermometer: () => (
        <svg className="w-3.5 h-3.5 opacity-70" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z"/>
        </svg>
    ),
    Terminal: () => (
        <svg className="w-3.5 h-3.5 opacity-75" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="m5 17 5-5-5-5M12 19h8"/>
        </svg>
    ),
    Play: () => (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <path d="M8 5v14l11-7z"/>
        </svg>
    ),
    Square: () => (
        <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
            <rect width="18" height="18" x="3" y="3" rx="2"/>
        </svg>
    ),
    RefreshCw: () => (
        <svg className="w-3 h-3" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
            <path d="M21 12a9 9 0 0 0-9-9 9.75 9.75 0 0 0-6.74 2.74L3 8M3 12a9 9 0 0 0 9 9 9.75 9.75 0 0 0 6.74-2.74L21 16"/>
            <path d="M16 16h5v5M3 3v5h5"/>
        </svg>
    ),
    AlertTriangle: () => (
        <svg className="w-5 h-5 text-spaCoral" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
            <path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/>
            <line x1="12" x2="12" y1="9" y2="13"/>
            <line x1="12" x2="12.01" y1="17" y2="17"/>
        </svg>
    ),
    Server: () => (
        <svg className="w-4 h-4 opacity-75" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
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
                <div className="gauge-center-text absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-[10px] font-bold font-mono text-spaText">
                    {value}{suffix}
                </div>
            </div>
            <span className="gauge-label text-[9px] font-bold text-spaMuted tracking-wider uppercase">{label}</span>
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

    // GSAP Stagger Entrance on load
    React.useEffect(() => {
        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (metrics && cardGridRef.current && !prefersReducedMotion) {
            const cards = cardGridRef.current.querySelectorAll('.gsap-card');
            if (cards.length > 0) {
                gsap.fromTo(cards, 
                    { opacity: 0, y: 35, rotateX: 10, scale: 0.96 },
                    { opacity: 1, y: 0, rotateX: 0, scale: 1, duration: 0.8, stagger: 0.08, ease: "power2.out" }
                );
            }
        }
    }, [metrics === null]);

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

    const dismissAlarm = (logText) => {
        setDismissedAlarms(prev => {
            const updated = new Set(prev);
            updated.add(logText);
            return updated;
        });
    };

    if (!metrics) {
        return (
            <div className="flex items-center justify-center min-h-screen bg-spaBackground">
                <div className="text-center">
                    <div className="inline-block w-8 h-8 border-2 border-t-spaPink border-r-transparent border-b-spaPink border-l-transparent rounded-full animate-spin"></div>
                    <div className="mt-4 text-spaGold font-serif italic text-lg tracking-widest">SERENITY SYNCING...</div>
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
        <div className="max-w-[1440px] mx-auto p-6 md:p-8 flex flex-col gap-8 relative z-10 font-sans">
            {/* Header */}
            <header className="glass-panel px-8 py-5 flex flex-wrap justify-between items-center gap-4 transition-all duration-300">
                <div className="flex items-center gap-3.5">
                    <span className="w-3 h-3 bg-spaPink rounded-full shadow-[0_0_8px_#E8B4B8] animate-pulse"></span>
                    <h1 className="text-2xl font-serif font-light tracking-widest text-spaText">
                        SERENITY CLUSTER TELEMETRY
                    </h1>
                </div>
                
                <div className="flex items-center gap-6 text-xs">
                    <div className="flex items-center gap-2">
                        <span className="w-2 h-2 bg-spaGreen rounded-full shadow-[0_0_6px_#87A987]"></span>
                        <span className="font-semibold tracking-wider text-spaMuted uppercase">HARMONIZED STATE</span>
                    </div>
                    
                    <span className="font-mono text-slate-500 tracking-widest">{clock}</span>
                    
                    {/* 3D Isometric View Toggle */}
                    <button onClick={() => setIs3d(!is3d)} 
                            className={`px-4 py-2 text-[10px] font-bold tracking-wider rounded-xl border transition-all duration-300 active:scale-95 flex items-center gap-2 ${
                                is3d 
                                ? 'bg-spaPink/10 border-spaPink/20 text-spaPink shadow-[0_4px_12px_rgba(232,180,184,0.12)]' 
                                : 'bg-white/40 border-spaPink/10 text-spaMuted'
                            }`}>
                        <Icons.Server />
                        {is3d ? "3D SPATIAL: ON" : "3D SPATIAL: OFF"}
                    </button>
                </div>
            </header>

            {/* Loop Alert Banner */}
            {loopAlert && (
                <div className="glass-panel border-spaCoral/20 bg-red-50/50 p-6 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 animate-[float_4s_ease-in-out_infinite]">
                    <div className="flex items-start gap-3">
                        <Icons.AlertTriangle />
                        <div>
                            <strong className="text-spaCoral font-serif text-base tracking-wide">AI GENERATOR REPETITION ALERT</strong>
                            <p className="text-xs text-spaMuted mt-1">
                                Uniqueness score dropped below threshold to <span className="text-spaCoral font-bold">{loopAlert.score}%</span> on node <strong>{loopAlert.node.replace("spark-", "")}</strong>.
                            </p>
                        </div>
                    </div>
                    <button onClick={() => sendControlAction('service', loopAlert.node, 'vllm', 'restart')} 
                            className="bg-spaCoral hover:bg-red-400 text-white text-xs font-bold px-5 py-3 rounded-xl active:scale-95 transition-all shadow-md shadow-spaCoral/10">
                        REFRESH GENERATOR INSTANCE
                    </button>
                </div>
            )}

            {/* Kernel / OOM Alarm Banner */}
            {activeAlarm && (
                <div className="glass-panel border-spaCoral/25 bg-red-50/40 p-6 flex justify-between items-start gap-4">
                    <div className="flex items-start gap-3">
                        <Icons.AlertTriangle />
                        <div>
                            <strong className="text-spaCoral font-serif text-base tracking-wide">
                                {activeAlarm.type === "xid" ? "NVIDIA HARDWARE DRIVER EXCEPTION" : "OUT OF MEMORY (OOM) SYSTEM RECOVERY"}
                            </strong>
                            <p className="text-xs text-spaMuted mt-1.5 leading-relaxed font-mono">
                                Node <strong>{activeAlarm.node.replace("spark-", "")}</strong>: <br/>
                                <span className="text-slate-600 font-mono mt-1 block">{activeAlarm.text}</span>
                            </p>
                        </div>
                    </div>
                    <button onClick={() => dismissAlarm(activeAlarm.logText)} 
                            className="bg-white hover:bg-slate-50 text-spaMuted border border-spaPink/25 text-xs font-bold px-4 py-2 rounded-xl active:scale-95 transition-all">
                        DISMISS
                    </button>
                </div>
            )}

            {/* Cluster Node Dials Grid */}
            <section className="perspective-container relative z-20">
                <div ref={cardGridRef} className={`grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-8 isometric-grid ${is3d ? "active-3d" : ""}`}>
                    {Object.keys(metrics.nodes).map(nodeId => {
                        const node = metrics.nodes[nodeId];
                        const cleanId = nodeId.replace("spark-", "");
                        
                        if (!node.online) {
                            return (
                                <div key={nodeId} className="node-card-3d gsap-card glass-panel opacity-70 flex flex-col justify-center items-center h-[280px] p-6 text-center border-slate-200/50 bg-white/20">
                                    <span className="w-12 h-12 rounded-full border border-spaCoral/25 bg-red-50 text-spaCoral flex items-center justify-center mb-3">
                                        <Icons.AlertTriangle />
                                    </span>
                                    <h3 className="text-xl font-serif font-light text-spaMuted uppercase tracking-widest">{cleanId}</h3>
                                    <p className="text-xs text-slate-400 mt-2 max-w-[200px] leading-relaxed">Node inactive. Check SSH connectivity.</p>
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

                        const isSwapping = swapIn > 0.5 || swapOut > 0.5;
                        const isThrashing = iowaitVal > 8.0;
                        const isMemorySaturated = psiSome > 10.0;

                        // GPU sub-panel
                        let gpuBlock = null;
                        if (node.gpu && node.gpu.online) {
                            const vramPerc = node.gpu.mem_total ? Math.round((node.gpu.mem_used / node.gpu.mem_total) * 100) : 0;
                            const powerLimit = node.gpu.power_limit || 300;
                            
                            gpuBlock = (
                                <div className="border-t border-spaPink/10 pt-4 mt-4">
                                    <div className="flex justify-between items-center mb-3">
                                        <span className="text-[10px] font-bold text-spaGold tracking-widest uppercase">GPU Core telemetry</span>
                                        {node.gpu.throttle_reason && node.gpu.throttle_reason !== "None" && (
                                            <span className="text-[8px] bg-spaCoral/10 border border-spaCoral/20 text-spaCoral px-2.5 py-0.5 rounded pulsing-badge font-bold">
                                                {node.gpu.throttle_reason}
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
                                <div className="border-t border-spaPink/10 pt-4 mt-4 flex items-center justify-center py-3 text-center">
                                    <p className="text-[10px] font-bold tracking-widest text-slate-300 uppercase">GPU INACTIVE</p>
                                </div>
                            );
                        }

                        return (
                            <div key={nodeId} className="node-card-3d gsap-card glass-panel p-6 relative flex flex-col justify-between border-spaPink/10 bg-white/40">
                                {/* Header */}
                                <div className="flex justify-between items-start mb-5">
                                    <div>
                                        <h3 className="text-xl font-serif font-light text-spaText tracking-wide flex items-center gap-2">
                                            {cleanId}
                                            {isMemorySaturated && <span className="text-[8px] bg-spaCoral/10 border border-spaCoral/20 text-spaCoral px-1.5 py-0.5 rounded tracking-wide font-mono">PSI</span>}
                                            {isSwapping && <span className="text-[8px] bg-spaGold/10 border border-spaGold/20 text-spaGold px-1.5 py-0.5 rounded tracking-wide pulsing-badge font-mono">SWAP</span>}
                                            {isThrashing && <span className="text-[8px] bg-spaCoral/10 border border-spaCoral/20 text-spaCoral px-1.5 py-0.5 rounded tracking-wide font-mono">THRASH</span>}
                                        </h3>
                                    </div>
                                    <span className="text-[9px] bg-spaGreen/10 border border-spaGreen/20 text-spaGreen px-2.5 py-0.5 rounded-full font-bold uppercase tracking-wider">ONLINE</span>
                                </div>

                                {/* System Radial Dials */}
                                <div className="flex gap-2 justify-between mb-5">
                                    {CircularGauge({ value: node.cpu, label: 'CPU', colorFn: getGoodBadColor })}
                                    {CircularGauge({ value: ramPerc, label: 'RAM', colorFn: getGoodBadColor })}
                                    {swapTotal > 0 && CircularGauge({ value: swapPerc, label: 'SWAP', colorFn: getGoodBadColor })}
                                    {CircularGauge({ value: node.disk.perc, label: 'DISK', colorFn: getGoodBadColor })}
                                </div>

                                {/* Micro Details */}
                                <div className="border-t border-spaPink/10 pt-4 text-[10px] font-mono text-spaMuted flex flex-col gap-2">
                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-spaBackground/40 p-2.5 rounded-xl border border-spaPink/10">
                                        <div>I/O Wait: <span className="text-spaText font-bold">{iowaitVal}%</span></div>
                                        <div>Mem PSI: <span className="text-spaText font-bold">{psiSome}%</span></div>
                                        <div>RAM: <span className="text-spaText font-bold">{(node.ram.used/1024).toFixed(0)}/{(node.ram.total/1024).toFixed(0)} GB</span></div>
                                        {swapTotal > 0 && <div>Swap: <span className="text-spaText font-bold">{(swapUsed/1024).toFixed(0)}/{(swapTotal/1024).toFixed(0)} GB</span></div>}
                                    </div>
                                    <div className="flex justify-between px-1">
                                        <span>Read: <span className="text-spaText font-bold">{readRate >= 1024 ? `${(readRate/1024).toFixed(1)} MB/s` : `${readRate.toFixed(0)} KB/s`}</span></span>
                                        <span>Write: <span className="text-spaText font-bold">{writeRate >= 1024 ? `${(writeRate/1024).toFixed(1)} MB/s` : `${writeRate.toFixed(0)} KB/s`}</span></span>
                                    </div>
                                </div>

                                {/* GPU block */}
                                {gpuBlock}
                            </div>
                        );
                    })}
                </div>
            </section>

            {/* Dashboard Lower Stack - Queue, Logs, & App Control */}
            <main ref={cardGridRef} className="grid grid-cols-1 lg:grid-cols-3 gap-8 relative z-10">
                {/* Col 1: Queue and vLLM cache */}
                <section className="gsap-card glass-panel p-6 border-spaPink/10 bg-white/40 flex flex-col gap-6">
                    <h2 className="text-sm font-bold tracking-widest text-spaMuted uppercase flex items-center gap-2">
                        <Icons.Database />
                        QUEUE & VRAM CACHE
                    </h2>
                    
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-spaBackground/40 border border-spaPink/10 p-3.5 rounded-xl text-center">
                            <span className="block text-[10px] font-bold text-spaMuted tracking-wider uppercase">ACTIVE TASKS</span>
                            <span className="block text-2xl font-mono font-bold text-spaPink mt-1">{totalRunning || queueActiveCount}</span>
                        </div>
                        <div className="bg-spaBackground/40 border border-spaPink/10 p-3.5 rounded-xl text-center">
                            <span className="block text-[10px] font-bold text-spaMuted tracking-wider uppercase">QUEUED TASKS</span>
                            <span className="block text-2xl font-mono font-bold text-spaGold mt-1">{totalWaiting || queueWaitingCount}</span>
                        </div>
                    </div>

                    {/* KV Cache bars */}
                    <div className="flex flex-col gap-3">
                        <span className="text-[10px] font-bold text-spaMuted tracking-wider uppercase">vLLM KV Cache Allocation</span>
                        {Object.keys(metrics.vllm).map(modelName => {
                            const v = metrics.vllm[modelName];
                            const width = v.online ? `${v.kv_cache_usage}%` : "0%";
                            return (
                                <div key={modelName} className="bg-spaBackground/40 border border-spaPink/10 p-3.5 rounded-xl flex flex-col gap-2">
                                    <div className="flex justify-between items-center text-[10px] font-bold font-mono">
                                        <span className="text-spaText">{modelName}</span>
                                        <span className={v.online ? "text-spaPink" : "text-spaCoral"}>{v.online ? `${v.kv_cache_usage.toFixed(1)}%` : "OFFLINE"}</span>
                                    </div>
                                    <div className="h-2 w-full bg-slate-200/50 rounded-full overflow-hidden border border-spaPink/5">
                                        <div className="h-full bg-gradient-to-r from-spaPink to-spaGold rounded-full transition-[width] duration-700 ease-out" style={{ width }} />
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {/* Active Jobs Queue */}
                    <div className="flex flex-col gap-2.5">
                        <span className="text-[10px] font-bold text-spaMuted tracking-wider uppercase">Active Pipeline Tasks</span>
                        <div className="max-h-[140px] overflow-y-auto pr-1 flex flex-col gap-2 custom-scrollbar">
                            {metrics.queue.active && metrics.queue.active.length > 0 ? (
                                metrics.queue.active.map(job => (
                                    <div key={job.task_id || job.id} className="bg-spaBackground/30 border border-spaPink/10 px-3 py-2.5 rounded-xl flex justify-between items-center text-[10px]">
                                        <div className="flex flex-col gap-0.5">
                                            <span className="font-bold text-spaText">{job.model || "Hermes-70B"}</span>
                                            <span className="font-mono text-slate-400">ID: {(job.task_id || job.id).substring(0, 8)}...</span>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <span className="font-mono font-bold text-spaPink uppercase">[{job.status}]</span>
                                            <button onClick={() => cancelQueueTask(job.task_id || job.id)} 
                                                    className="px-2.5 py-1.5 bg-red-50 hover:bg-red-100/50 border border-spaCoral/20 hover:border-spaCoral/40 text-spaCoral rounded-lg font-bold transition-all duration-200">
                                                CANCEL
                                            </button>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="text-center text-xs text-slate-400 py-6">No jobs currently executing in the queue.</div>
                            )}
                        </div>
                    </div>
                </section>

                {/* Col 2: AI Loop Diagnostics */}
                <section className="gsap-card glass-panel p-6 border-spaPink/10 bg-white/40 flex flex-col gap-6 justify-between">
                    <div className="flex flex-col gap-4">
                        <h2 className="text-sm font-bold tracking-widest text-spaMuted uppercase flex items-center gap-2">
                            <Icons.Cpu />
                            AI REPETITION DIAGNOSTICS
                        </h2>
                        
                        <div className="flex flex-col items-center py-4 bg-spaBackground/20 border border-spaPink/10 rounded-2xl">
                            {Object.keys(metrics.nodes).map(nid => {
                                const n = metrics.nodes[nid];
                                if (n.online && n.chat_loop_diagnostics) {
                                    const score = Math.round(n.chat_loop_diagnostics.repetition_score * 100);
                                    return (
                                        <div key={nid} className="flex flex-col items-center gap-3">
                                            <div className="w-24 h-24 relative">
                                                <svg viewBox="0 0 36 36" className="circular-chart w-full h-full">
                                                    <path className="circle-bg" d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                                    <path className="circle-fill" 
                                                          strokeDasharray={`${score}, 100`} 
                                                          stroke={getGoodBadColor(score)} 
                                                          d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831" />
                                                </svg>
                                                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
                                                    <span className="block text-lg font-bold font-mono text-spaText">{score}%</span>
                                                    <span className="block text-[7px] text-spaMuted font-bold uppercase tracking-wide">Entropy</span>
                                                </div>
                                            </div>
                                            <span className="text-[10px] font-bold tracking-wider text-spaMuted uppercase">
                                                4-gram Repetition Metric
                                            </span>
                                        </div>
                                    );
                                }
                            })}
                        </div>
                    </div>

                    {/* Code Stream Screen */}
                    <div className="flex flex-col gap-2.5">
                        <span className="text-[10px] font-bold text-spaMuted tracking-wider uppercase flex items-center gap-1">
                            <Icons.Terminal />
                            Live Inference Stream
                        </span>
                        {Object.keys(metrics.nodes).map(nid => {
                            const n = metrics.nodes[nid];
                            if (n.online && n.chat_loop_diagnostics) {
                                return (
                                    <div key={nid} className="terminal-screen p-3.5 rounded-xl font-mono text-[10px] flex flex-col gap-2 text-slate-100">
                                        <div className="flex flex-col gap-1 max-h-[85px] overflow-y-auto custom-scrollbar">
                                            <span className="text-spaPink font-bold">USER:</span>
                                            <p className="text-slate-300 leading-normal bg-slate-900/40 p-2 rounded border border-white/5 select-all">{n.chat_loop_diagnostics.latest_prompt || "Idle..."}</p>
                                        </div>
                                        <div className="flex flex-col gap-1 max-h-[105px] overflow-y-auto custom-scrollbar border-t border-white/5 pt-2">
                                            <span className="text-spaGold font-bold">GENERATION:</span>
                                            <p className="text-slate-300 leading-normal bg-slate-900/40 p-2 rounded border border-white/5 select-all">{n.chat_loop_diagnostics.latest_response || "Waiting..."}</p>
                                        </div>
                                    </div>
                                );
                            }
                        })}
                    </div>
                </section>

                {/* Col 3: App Controls & Services */}
                <section className="gsap-card glass-panel p-6 border-spaPink/10 bg-white/40 flex flex-col gap-5">
                    <h2 className="text-sm font-bold tracking-widest text-spaMuted uppercase flex items-center gap-2">
                        <Icons.Terminal />
                        WORKLOAD MONITOR
                    </h2>
                    
                    <div className="flex flex-col gap-4 max-h-[440px] overflow-y-auto pr-1 custom-scrollbar">
                        {Object.keys(metrics.nodes).map(nodeId => {
                            const node = metrics.nodes[nodeId];
                            if (!node.online) return null;
                            const cleanId = nodeId.replace("spark-", "");
                            
                            return (
                                <div key={nodeId} className="flex flex-col gap-3">
                                    <div className="text-[10px] font-bold text-spaMuted uppercase tracking-widest border-b border-spaPink/10 pb-1">
                                        Node {cleanId} Processes
                                    </div>
                                    
                                    {node.dockers && node.dockers.length > 0 ? (
                                        <div className="flex flex-col gap-2.5">
                                            {node.dockers.map(d => {
                                                const ramUsed = d.mem_usage.includes('/') ? d.mem_usage.split('/')[0].trim() : d.mem_usage;
                                                const totalRam = d.mem_usage.includes('/') ? d.mem_usage.split('/')[1].trim() : '';
                                                const ramLabel = totalRam ? `${ramUsed} / ${totalRam}` : ramUsed;
                                                const isRunning = d.state === "running";
                                                
                                                return (
                                                    <div key={d.name} className="bg-spaBackground/40 border border-spaPink/10 p-3.5 rounded-xl flex flex-col gap-2.5">
                                                        <div className="flex justify-between items-center text-[10px]">
                                                            <div className="flex flex-col gap-0.5">
                                                                <span className="font-bold text-spaText">{d.name}</span>
                                                                <span className="text-[9px] text-slate-400 font-mono truncate max-w-[130px]" title={d.image}>{d.image.split(':')[0]}</span>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <span className={`w-2 h-2 rounded-full ${isRunning ? "bg-spaGreen shadow-[0_0_6px_#87A987]" : "bg-spaCoral shadow-[0_0_6px_#D27D7D]"}`}></span>
                                                                <span className="font-mono text-spaMuted leading-none">{d.status}</span>
                                                            </div>
                                                        </div>
                                                        
                                                        {isRunning && (
                                                            <div className="bg-spaBackground/20 p-2.5 rounded-lg border border-spaPink/10 text-[9px] font-mono text-spaMuted flex justify-between items-center">
                                                                <span>CPU: <span className="text-spaText font-bold">{d.cpu_perc}</span></span>
                                                                <span>RAM: <span className="text-spaText font-bold">{ramLabel}</span></span>
                                                            </div>
                                                        )}
                                                        
                                                        <div className="flex gap-2 border-t border-spaPink/10 pt-2 justify-between">
                                                            <button onClick={() => setLogModal({ node_id: nodeId, type: "docker", name: d.name, logs: "Loading logs..." })} 
                                                                    className="flex-1 py-1 text-[9px] font-bold bg-white hover:bg-slate-50 border border-spaPink/15 text-spaText rounded-lg active:scale-95 transition-all uppercase">
                                                                Logs
                                                            </button>
                                                            <button onClick={() => sendControlAction('container', nodeId, d.name, 'restart')} 
                                                                    className="flex-1 py-1 text-[9px] font-bold bg-white hover:bg-slate-50 border border-spaPink/15 text-spaGold rounded-lg active:scale-95 transition-all uppercase">
                                                                Restart
                                                            </button>
                                                            {isRunning ? (
                                                                <button onClick={() => sendControlAction('container', nodeId, d.name, 'stop')} 
                                                                        className="flex-1 py-1 text-[9px] font-bold bg-red-50 hover:bg-red-100/50 border border-spaCoral/20 text-spaCoral rounded-lg active:scale-95 transition-all uppercase">
                                                                    Kill
                                                                </button>
                                                            ) : (
                                                                <button onClick={() => sendControlAction('container', nodeId, d.name, 'start')} 
                                                                        className="flex-1 py-1 text-[9px] font-bold bg-green-50 hover:bg-green-100/50 border border-spaGreen/20 text-spaGreen rounded-lg active:scale-95 transition-all uppercase">
                                                                    Start
                                                                </button>
                                                            )}
                                                        </div>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    ) : (
                                        <div className="text-[10px] text-slate-400 italic">No Docker workloads active.</div>
                                    )}
                                </div>
                            );
                        })}
                    </div>
                </section>
            </main>

            {/* Log Stream Modal Panel */}
            {logModal && (
                <div className="fixed inset-0 bg-slate-900/10 backdrop-blur-xl z-50 flex items-center justify-center p-4 md:p-6 transition-all duration-300">
                    <div className="glass-panel w-full max-w-[800px] border-spaPink/20 bg-[#2A2E2C] text-slate-100 shadow-[0_24px_50px_rgba(45,52,54,0.15)] flex flex-col h-[520px] overflow-hidden">
                        {/* Modal Header */}
                        <div className="px-5 py-4 border-b border-white/5 flex justify-between items-center bg-slate-900/30">
                            <div className="flex items-center gap-3">
                                <span className="w-2 h-2 bg-spaPink rounded-full animate-ping"></span>
                                <h3 className="text-xs font-bold tracking-widest text-slate-200 uppercase font-mono">
                                    [LOG STREAM] {logModal.node_id.replace("spark-", "")} // {logModal.name}
                                </h3>
                            </div>
                            <button onClick={() => setLogModal(null)} 
                                    className="px-4 py-2 bg-white hover:bg-slate-50 text-spaText text-xs font-bold rounded-lg border border-spaPink/25 active:scale-95 transition-all">
                                CLOSE
                            </button>
                        </div>
                        {/* Terminal Screen Body */}
                        <div className="flex-1 p-4 overflow-y-auto font-mono text-[10px] text-slate-300 leading-relaxed bg-slate-950/80 custom-scrollbar select-all">
                            {logModal.logs ? (
                                <pre className="whitespace-pre-wrap">{logModal.logs}</pre>
                            ) : (
                                <div className="flex items-center justify-center h-full">
                                    <div className="w-5 h-5 border-2 border-t-spaPink border-r-transparent border-b-spaPink border-l-transparent rounded-full animate-spin"></div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
