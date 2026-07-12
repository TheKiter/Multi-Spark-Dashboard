/* app.js - Neumorphic Telemetry & Control Suite (Stitch Redesign) */

const API_URL = "/api/metrics";
const CONTROL_CONTAINER_URL = "/api/control/container";
const CONTROL_SERVICE_URL = "/api/control/service";
const CONTROL_LOGS_URL = "/api/control/logs";
const CONTROL_TASK_CANCEL_URL = "/api/control/task/cancel";

// Quantized 10% step HSL color mappings
function getGoodBadColor(percentage) {
    const step = Math.round(percentage / 10) * 10;
    // Interpolates between Emerald HSL(159, 70%, 48%) and Rose HSL(350, 70%, 48%) in 10% steps
    const h = Math.max(0, 159 - (step * 1.69));
    return `hsl(${h}, 70%, 48%)`;
}

function getStrongWeakColor(percentage) {
    const step = Math.round(percentage / 10) * 10;
    // Interpolates between Steel Blue HSL(217, 65%, 52%) and Gold HSL(38, 65%, 52%) in 10% steps
    const h = Math.max(38, 217 - (step * 1.79));
    return `hsl(${h}, 65%, 52%)`;
}

// 10-Segment Vertical Gauge
const CircularGauge = ({ value, maxVal = 100, label, suffix = "%", colorFn, isLightTheme }) => {
    const perc = Math.max(0, Math.min(100, Math.round((value / maxVal) * 100)));
    const activeSegments = Math.round(perc / 10);
    
    const segments = [];
    for (let i = 9; i >= 0; i--) {
        const isActive = i < activeSegments;
        const segmentPercent = (i + 1) * 10;
        const color = isActive ? colorFn(segmentPercent) : (isLightTheme ? '#e8d4cc' : '#272a2e');
        
        segments.push(
            <div key={i} 
                 className="h-1.5 w-6 rounded-sm transition-all duration-300"
                 style={{ backgroundColor: color }} />
        );
    }
    
    return (
        <div className="gauge-item flex flex-col items-center gap-1 flex-1 select-none">
            <span className="text-[9px] font-bold font-mono text-on-surface opacity-80">
                {value}{suffix}
            </span>
            <div className="flex flex-col gap-[2px] p-[2px] recessed-inset bg-surface-container-low rounded-md overflow-hidden">
                {segments}
            </div>
            <span className="text-[8px] font-mono tracking-wider text-on-surface-variant font-bold uppercase mt-1 opacity-70">
                {label}
            </span>
        </div>
    );
};

// 10-Segment Horizontal Gauge (For high density table views)
const HorizontalSteppedGauge = ({ value, maxVal = 100, label, colorFn, isLightTheme }) => {
    const perc = Math.max(0, Math.min(100, Math.round((value / maxVal) * 100)));
    const activeSegments = Math.round(perc / 10);
    
    return (
        <div className="flex flex-col gap-1 w-24">
            <div className="flex justify-between text-[9px] text-on-surface-variant font-mono">
                <span>{label}</span>
                <span>{value}%</span>
            </div>
            <div className="flex gap-[2px] h-1.5 p-[1px] recessed-inset bg-surface-container rounded-sm overflow-hidden w-full">
                {[...Array(10)].map((_, i) => {
                    const isActive = i < activeSegments;
                    const segmentPercent = (i + 1) * 10;
                    const color = isActive ? colorFn(segmentPercent) : (isLightTheme ? '#e8d4cc' : '#272a2e');
                    return (
                        <div key={i} className="h-full flex-1 rounded-[1px] transition-all" style={{ backgroundColor: color }} />
                    );
                })}
            </div>
        </div>
    );
};

const App = () => {
    const [metrics, setMetrics] = React.useState(null);
    const [theme, setTheme] = React.useState(() => localStorage.getItem("spark-theme") || "dark");
    const [activeTab, setActiveTab] = React.useState("all-nodes");
    const [viewMode, setViewMode] = React.useState("table"); // Default to high density table view as designed in Stitch
    const [logModal, setLogModal] = React.useState(null); // { node_id, type, name, logs }
    const [dismissedAlarms, setDismissedAlarms] = React.useState(new Set());
    const [clock, setClock] = React.useState("00:00:00");
    const [isUpdating, setIsUpdating] = React.useState(false);
    const [selectedNodeId, setSelectedNodeId] = React.useState(null);
    
    const logIntervalRef = React.useRef(null);
    
    // Live clock update
    React.useEffect(() => {
        const timer = setInterval(() => {
            const now = new Date();
            setClock(now.toTimeString().split(' ')[0]);
        }, 1000);
        return () => clearInterval(timer);
    }, []);
    
    // Telemetry fetch & polling
    const fetchTelemetry = async () => {
        try {
            setIsUpdating(true);
            const res = await fetch(API_URL);
            const data = await res.json();
            setMetrics(data);
        } catch (e) {
            console.error("Failed fetching telemetry:", e);
        } finally {
            setIsUpdating(false);
        }
    };
    
    React.useEffect(() => {
        fetchTelemetry();
        const poll = setInterval(fetchTelemetry, 2500);
        return () => clearInterval(poll);
    }, []);
    
    // Log polling modal handler
    React.useEffect(() => {
        if (logModal) {
            const pollLogs = async () => {
                try {
                    const res = await fetch(`${CONTROL_LOGS_URL}?node_id=${logModal.node_id}&type=${logModal.type}&name=${logModal.name}`);
                    const data = await res.json();
                    setLogModal(prev => prev ? { ...prev, logs: data.logs } : null);
                } catch (e) {
                    console.error("Error polling logs:", e);
                }
            };
            pollLogs();
            logIntervalRef.current = setInterval(pollLogs, 3000);
        } else {
            if (logIntervalRef.current) clearInterval(logIntervalRef.current);
        }
        return () => {
            if (logIntervalRef.current) clearInterval(logIntervalRef.current);
        };
    }, [logModal]);
    
    // Theme toggle mapping
    React.useEffect(() => {
        const root = document.documentElement;
        if (theme === "light") {
            root.classList.add("light");
            root.classList.remove("dark");
        } else {
            root.classList.add("dark");
            root.classList.remove("light");
        }
        localStorage.setItem("spark-theme", theme);
    }, [theme]);

    
    // Control Action executors
    const sendControlAction = async (type, nodeId, name, action) => {
        const verb = action === "stop" ? "KILL/STOP" : (action === "restart" ? "RESTART" : "START");
        if (!confirm(`Are you sure you want to trigger ${verb} on ${name} (${nodeId})?`)) return;
        
        try {
            const url = type === "container" ? CONTROL_CONTAINER_URL : CONTROL_SERVICE_URL;
            const body = type === "container" 
                ? { node_id: nodeId, container_name: name, action }
                : { node_id: nodeId, service_name: name, action };
                
            const res = await fetch(url, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(body)
            });
            const data = await res.json();
            alert(data.status || data.error || "Action completed.");
            fetchTelemetry();
        } catch (e) {
            alert("Failed to send action: " + e.message);
        }
    };
    
    const cancelQueueTask = async (taskId) => {
        if (!confirm(`Cancel task ${taskId}?`)) return;
        try {
            const res = await fetch(CONTROL_TASK_CANCEL_URL, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ task_id: taskId })
            });
            const data = await res.json();
            alert(data.status || data.error || "Task cancelled.");
            fetchTelemetry();
        } catch (e) {
            alert("Failed to cancel task: " + e.message);
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
            <div className="flex items-center justify-center min-h-screen bg-surface">
                <div className="text-center">
                    <div className="inline-block w-8 h-8 border-2 border-t-tertiary border-r-transparent border-b-tertiary border-l-transparent rounded-full animate-spin"></div>
                    <div className="mt-4 text-on-surface-variant text-[11px] tracking-widest font-mono font-medium uppercase">TELEMETRY STREAM INITIALIZING...</div>
                </div>
            </div>
        );
    }
    
    const isLightTheme = theme === "light";
    

    
    // Compile Warnings and Alarms
    let activeAlarm = null;
    for (const nid in metrics.nodes) {
        const n = metrics.nodes[nid];
        if (n.online && n.oom_events && n.oom_events.length > 0) {
            const latest = n.oom_events[n.oom_events.length - 1];
            const logText = `[${nid}] ${latest.text}`;
            if (!dismissedAlarms.has(logText)) {
                activeAlarm = { type: "oom", node: nid, text: latest.text, logText };
                break;
            }
        }
        if (n.online && n.xid_events && n.xid_events.length > 0) {
            const latest = n.xid_events[n.xid_events.length - 1];
            const logText = `[${nid}] ${latest.text}`;
            if (!dismissedAlarms.has(logText)) {
                activeAlarm = { type: "xid", node: nid, text: latest.text, logText };
                break;
            }
        }
    }
    
    let loopAlert = null;
    for (const m in metrics.vllm) {
        const v = metrics.vllm[m];
        if (v.online && v.chat_loop_diagnostics && v.chat_loop_diagnostics.repetition_warning) {
            loopAlert = { node: v.node_id, score: Math.round(v.chat_loop_diagnostics.repetition_score * 100) };
            break;
        }
    }
    
    // Summary Calculations
    const nodeIds = Object.keys(metrics.nodes);
    const totalNodes = nodeIds.length;
    const onlineNodes = nodeIds.filter(nid => metrics.nodes[nid].online).length;
    
    // Average GPU Utilization
    const gpuNodes = nodeIds.filter(nid => metrics.nodes[nid].online && metrics.nodes[nid].gpu && metrics.nodes[nid].gpu.online);
    const avgGpuLoad = gpuNodes.length 
        ? Math.round(gpuNodes.reduce((acc, nid) => acc + metrics.nodes[nid].gpu.gpu_util, 0) / gpuNodes.length)
        : 0;
        
    // Throughput or KV Cache
    const activeModels = Object.keys(metrics.vllm).filter(m => metrics.vllm[m].online);
    const avgKvCache = activeModels.length
        ? Math.round(activeModels.reduce((acc, m) => acc + metrics.vllm[m].kv_cache_usage, 0) / activeModels.length)
        : 0;
        
    const queueWaitingCount = metrics.queue.waiting ? metrics.queue.waiting.length : 0;
    
    return (
        <div className="min-h-screen flex text-on-surface">
            {/* Sidebar Navigation */}
            <aside className="h-screen w-64 fixed left-0 top-0 bg-surface flex flex-col p-gutter space-y-4 shadow-[8px_0_16px_var(--shadow-dark)] z-[60] border-r border-white/5">
                <div className="mb-8">
                    <h1 className="font-headline-sm text-headline-sm font-bold text-tertiary glow-teal tracking-wider">MS-TELEMETRY</h1>
                    <p className="font-label-mono text-label-mono text-on-surface-variant opacity-60">Active Session: 0x4F2</p>
                </div>
                
                <nav className="flex-grow space-y-2 select-none">
                    <button onClick={() => setActiveTab("all-nodes")}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-label-mono text-label-mono transition-all text-left ${
                                activeTab === "all-nodes"
                                ? 'bg-surface-container-high text-tertiary shadow-[inset_4px_4px_8px_var(--shadow-dark),inset_-4px_-4px_8px_var(--shadow-light)]'
                                : 'text-on-surface-variant hover:bg-surface-container-low hover:scale-[1.02]'
                            }`}>
                        <span className="material-symbols-outlined text-[18px]">hub</span>
                        <span>All Nodes</span>
                    </button>
                    

                    
                    <button onClick={() => setActiveTab("vllm")}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-label-mono text-label-mono transition-all text-left ${
                                activeTab === "vllm"
                                ? 'bg-surface-container-high text-tertiary shadow-[inset_4px_4px_8px_var(--shadow-dark),inset_-4px_-4px_8px_var(--shadow-light)]'
                                : 'text-on-surface-variant hover:bg-surface-container-low hover:scale-[1.02]'
                            }`}>
                        <span className="material-symbols-outlined text-[18px]">lan</span>
                        <span>vLLM Instances</span>
                    </button>
                    
                    <button onClick={() => setActiveTab("queue")}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-label-mono text-label-mono transition-all text-left ${
                                activeTab === "queue"
                                ? 'bg-surface-container-high text-tertiary shadow-[inset_4px_4px_8px_var(--shadow-dark),inset_-4px_-4px_8px_var(--shadow-light)]'
                                : 'text-on-surface-variant hover:bg-surface-container-low hover:scale-[1.02]'
                            }`}>
                        <span className="material-symbols-outlined text-[18px]">hourglass_empty</span>
                        <span>Queue Status</span>
                    </button>
                    
                    <button onClick={() => setActiveTab("containers")}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-label-mono text-label-mono transition-all text-left ${
                                activeTab === "containers"
                                ? 'bg-surface-container-high text-tertiary shadow-[inset_4px_4px_8px_var(--shadow-dark),inset_-4px_-4px_8px_var(--shadow-light)]'
                                : 'text-on-surface-variant hover:bg-surface-container-low hover:scale-[1.02]'
                            }`}>
                        <span className="material-symbols-outlined text-[18px]">dns</span>
                        <span>Container Health</span>
                    </button>
                    
                    <button onClick={() => setActiveTab("psi")}
                            className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg font-label-mono text-label-mono transition-all text-left ${
                                activeTab === "psi"
                                ? 'bg-surface-container-high text-tertiary shadow-[inset_4px_4px_8px_var(--shadow-dark),inset_-4px_-4px_8px_var(--shadow-light)]'
                                : 'text-on-surface-variant hover:bg-surface-container-low hover:scale-[1.02]'
                            }`}>
                        <span className="material-symbols-outlined text-[18px]">speed</span>
                        <span>System PSI</span>
                    </button>
                </nav>
                
                <div className="pt-4 border-t border-outline-variant/30 flex flex-col gap-2">
                    <button onClick={() => window.print()}
                            className="w-full extruded-raised bg-surface-container-high text-tertiary font-label-mono text-label-mono py-2 rounded-lg active:shadow-[inset_4px_4px_8px_var(--shadow-dark)] active:scale-95 transition-all text-center">
                        Print Screen
                    </button>
                    <button onClick={() => {
                                const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(metrics, null, 2));
                                const dlAnchor = document.createElement('a');
                                dlAnchor.setAttribute("href", jsonStr);
                                dlAnchor.setAttribute("download", `spark_telemetry_dump_${Date.now()}.json`);
                                dlAnchor.click();
                            }}
                            className="w-full text-center text-[10px] text-on-surface-variant hover:text-tertiary font-label-mono tracking-wider py-1 border border-transparent hover:border-tertiary/10 rounded">
                        EXPORT RAW METRICS
                    </button>
                </div>
            </aside>
            
            {/* Main Area */}
            <main className="ml-64 min-h-screen flex flex-col flex-1">
                {/* Topbar Header */}
                <header className="w-full h-16 flex justify-between items-center px-margin-desktop sticky top-0 z-50 bg-surface shadow-[8px_8px_16px_var(--shadow-dark),-8px_-8px_16px_var(--shadow-light)] border-b border-white/5">
                    <div className="flex items-center gap-4">
                        <span className="font-headline-md text-headline-md font-bold text-tertiary drop-shadow-[0_0_8px_var(--glow-color-teal)] uppercase tracking-wider">
                            {activeTab.replace("-", " ")}
                        </span>
                        
                        {/* Status Sync Clock */}
                        <div className="recessed-inset bg-surface-container-low rounded-full px-4 py-1 flex items-center gap-2">
                            <span className="material-symbols-outlined text-on-surface-variant text-[16px]">schedule</span>
                            <span className="text-label-mono font-label-mono text-on-surface-variant font-bold">{clock}</span>
                        </div>
                    </div>
                    
                    <div className="flex items-center gap-6">


                        {/* Theme Toggle Button */}
                        <button onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                                className="w-10 h-10 rounded-lg flex items-center justify-center extruded-raised hover-lift bg-surface-container-high text-tertiary">
                            <span className="material-symbols-outlined">
                                {isLightTheme ? "dark_mode" : "light_mode"}
                            </span>
                        </button>
                        
                        {/* Status Badge */}
                        <div className="flex items-center gap-2 px-3 py-1 bg-surface-container rounded-full border border-tertiary/20">
                            <span className={`w-2 h-2 rounded-full bg-tertiary animate-pulse ${isLightTheme ? 'bg-sky-500' : 'glow-teal'}`}></span>
                            <span className="font-label-mono text-label-mono text-tertiary font-bold">SYSTEM ACTIVE</span>
                        </div>
                    </div>
                </header>
                
                {/* Dashboard Page Wrapper */}
                <div className="p-margin-desktop space-y-8 flex-1">
                    
                    {/* Alarms Banners */}
                    {activeAlarm && (
                        <div className="extruded-raised border-red-500/30 bg-red-950/10 p-5 rounded-xl flex justify-between items-start gap-4 animate-bounce">
                            <div className="flex items-start gap-3">
                                <span className="material-symbols-outlined text-red-400 text-3xl">error</span>
                                <div>
                                    <strong className="text-red-400 text-xs tracking-wider uppercase font-bold">
                                        {activeAlarm.type === "xid" ? "NVIDIA Xid Exception" : "Kernel Out Of Memory (OOM) Alert"}
                                    </strong>
                                    <p className="text-[11px] text-on-surface-variant mt-1 leading-normal font-mono">
                                        Node <strong>{activeAlarm.node.replace("spark-", "")}</strong> exception trigger: <br/>
                                        <span className="text-on-surface font-mono mt-1 block bg-black/30 p-2 rounded border border-white/5">{activeAlarm.text}</span>
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => dismissAlarm(activeAlarm.logText)} 
                                    className="bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant border border-outline-variant/30 text-[10px] tracking-wider uppercase font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-all shadow-[2px_2px_4px_var(--shadow-dark)]">
                                Dismiss
                            </button>
                        </div>
                    )}
                    
                    {loopAlert && (
                        <div className="extruded-raised border-red-500/30 bg-red-950/10 p-5 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                            <div className="flex items-start gap-3">
                                <span className="material-symbols-outlined text-red-400 text-3xl">warning</span>
                                <div>
                                    <strong className="text-red-400 text-xs tracking-wider uppercase font-bold">vLLM Inference Repetition Warning</strong>
                                    <p className="text-[11px] text-on-surface-variant mt-1">
                                        Uniqueness score dropped to <span className="text-red-400 font-bold">{loopAlert.score}%</span> on node <strong>{loopAlert.node.replace("spark-", "")}</strong>.
                                    </p>
                                </div>
                            </div>
                            <button onClick={() => sendControlAction('service', loopAlert.node, 'vllm', 'restart')} 
                                    className="bg-red-500 hover:bg-red-400 text-white text-[10px] tracking-wider uppercase font-bold px-4 py-2 rounded-lg active:scale-95 transition-all shadow-[2px_2px_4px_var(--shadow-dark)]">
                                Reset vLLM Daemon
                            </button>
                        </div>
                    )}
                    
                    {/* Render active tab */}
                    {activeTab === "all-nodes" && (
                        <div className="space-y-8">

                            
                            {/* View Selector Row */}
                            <div className="flex justify-between items-center bg-surface-container-low p-3 rounded-xl border border-white/5 shadow-[2px_2px_6px_var(--shadow-dark)]">
                                <span className="font-label-mono text-label-mono font-bold tracking-wider text-on-surface">SYSTEM CLUSTER DIAGNOSTICS</span>
                                <div className="pressed-neumorphic p-[2px] rounded-lg flex gap-1">
                                    <button onClick={() => setViewMode("table")}
                                            className={`px-3 py-1.5 text-[10px] font-bold tracking-wider font-label-mono rounded transition-all active:scale-95 ${
                                                viewMode === "table"
                                                ? 'bg-surface shadow-[2px_2px_4px_var(--shadow-dark),-2px_-2px_4px_var(--shadow-light)] text-tertiary'
                                                : 'text-on-surface-variant hover:text-on-surface'
                                            }`}>
                                        TABLE VIEW
                                    </button>
                                    <button onClick={() => setViewMode("grid")}
                                            className={`px-3 py-1.5 text-[10px] font-bold tracking-wider font-label-mono rounded transition-all active:scale-95 ${
                                                viewMode === "grid"
                                                ? 'bg-surface shadow-[2px_2px_4px_var(--shadow-dark),-2px_-2px_4px_var(--shadow-light)] text-tertiary'
                                                : 'text-on-surface-variant hover:text-on-surface'
                                            }`}>
                                        GRID VIEW
                                    </button>
                                </div>
                            </div>
                            
                            {/* Node display block */}
                            {viewMode === "grid" ? (
                                /* GRID VIEW (Stepped vertical bars layout) */
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                    {Object.keys(metrics.nodes).map(nodeId => {
                                        const node = metrics.nodes[nodeId];
                                        const cleanId = nodeId.replace("spark-", "");
                                        
                                        if (!node.online) {
                                            const isSelected = selectedNodeId === nodeId;
                                            return (
                                                <div key={nodeId} 
                                                     onClick={() => setSelectedNodeId(nodeId)}
                                                     className={`extruded-raised cursor-pointer flex flex-col justify-center items-center h-[240px] p-6 text-center bg-surface opacity-55 transition-all hover:scale-[1.01] ${isSelected ? 'border border-tertiary shadow-[0_0_12px_rgba(20,184,166,0.25)]' : ''}`}>
                                                    <span className="material-symbols-outlined text-red-400 text-3xl mb-2">error</span>
                                                    <h3 className="text-sm font-bold text-on-surface-variant uppercase tracking-widest">{cleanId}</h3>
                                                    <p className="text-[10px] font-mono text-outline-variant mt-1">NODE OFFLINE</p>
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
                                        
                                        const vramPerc = node.gpu && node.gpu.mem_total ? Math.round((node.gpu.mem_used / node.gpu.mem_total) * 100) : 0;
                                        
                                        const isSelected = selectedNodeId === nodeId;
                                        return (
                                            <div key={nodeId} 
                                                 onClick={() => setSelectedNodeId(nodeId)}
                                                 className={`extruded-raised cursor-pointer p-5 flex flex-col justify-between bg-surface relative transition-all hover:scale-[1.01] ${isSelected ? 'border border-tertiary shadow-[0_0_12px_rgba(20,184,166,0.25)]' : ''}`}>
                                                {/* Card Header */}
                                                <div className="flex justify-between items-start mb-4">
                                                    <div>
                                                        <h3 className="text-sm font-bold text-on-surface tracking-wider flex items-center gap-1.5 uppercase font-label-mono">
                                                            {cleanId}
                                                            {isMemorySaturated && <span className="text-[7px] bg-red-500/10 border border-red-500/20 text-red-400 px-1.5 py-0.5 font-mono font-bold">PSI</span>}
                                                            {isSwapping && <span className="text-[7px] bg-amber-500/10 border border-amber-500/20 text-amber-400 px-1.5 py-0.5 font-mono font-bold">SWAP</span>}
                                                            {isThrashing && <span className="text-[7px] bg-red-500/10 border border-red-500/20 text-red-400 px-1.5 py-0.5 font-mono font-bold">THRASH</span>}
                                                            {node.gpu && node.gpu.online && node.gpu.throttle_reason && node.gpu.throttle_reason !== "None" && (
                                                                <span className="text-[7px] bg-red-500/10 border border-red-500/20 text-red-400 px-1.5 py-0.5 font-mono font-bold pulsing-badge">
                                                                    THROTTLE: {node.gpu.throttle_reason.toUpperCase()}
                                                                </span>
                                                            )}
                                                        </h3>
                                                    </div>
                                                    <span className="text-[8px] bg-tertiary/10 border border-tertiary/20 text-tertiary px-2 py-0.5 rounded-sm font-bold uppercase tracking-wider font-label-mono">Online</span>
                                                </div>
                                                
                                                {/* Stepped Gauges Container (System + GPU side-by-side) */}
                                                <div className="flex gap-2 justify-between items-stretch mb-4 bg-surface-container-low p-2 rounded-lg border border-white/5">
                                                    {/* System Stats */}
                                                    {CircularGauge({ value: node.cpu, label: 'CPU', colorFn: getGoodBadColor, isLightTheme })}
                                                    {CircularGauge({ value: ramPerc, label: 'RAM', colorFn: getGoodBadColor, isLightTheme })}
                                                    {swapTotal > 0 && CircularGauge({ value: swapPerc, label: 'SWAP', colorFn: getGoodBadColor, isLightTheme })}
                                                    {CircularGauge({ value: node.disk.perc, label: 'DISK', colorFn: getGoodBadColor, isLightTheme })}
                                                    
                                                    {/* Divider if GPU is online */}
                                                    {node.gpu && node.gpu.online && (
                                                        <div className="w-[1px] bg-outline-variant/35 self-stretch mx-1.5 my-1" />
                                                    )}
                                                    
                                                    {/* GPU Stats */}
                                                    {node.gpu && node.gpu.online && (
                                                        <React.Fragment>
                                                            {CircularGauge({ value: node.gpu.gpu_util, label: 'GPU', colorFn: getGoodBadColor, isLightTheme })}
                                                            {CircularGauge({ value: node.gpu.temp, maxVal: 100, label: 'TEMP', suffix: "\u00b0C", colorFn: getGoodBadColor, isLightTheme })}
                                                            {CircularGauge({ value: node.gpu.power_draw, maxVal: node.gpu.power_limit || 300, label: 'PWR', suffix: "W", colorFn: getStrongWeakColor, isLightTheme })}
                                                            {CircularGauge({ value: vramPerc, label: 'VRAM', colorFn: getStrongWeakColor, isLightTheme })}
                                                        </React.Fragment>
                                                    )}
                                                </div>
                                                
                                                {/* Micro Details */}
                                                <div className="border-t border-outline-variant/25 pt-3 text-[10px] font-mono text-on-surface-variant flex flex-col gap-2">
                                                    <div className="grid grid-cols-2 gap-x-4 gap-y-1 bg-surface-container-lowest/50 p-2 rounded border border-white/5">
                                                        <div>I/O Wait: <span className="text-on-surface font-bold">{iowaitVal}%</span></div>
                                                        <div>Mem PSI: <span className="text-on-surface font-bold">{psiSome}%</span></div>
                                                        <div>RAM: <span className="text-on-surface font-bold">{(node.ram.used/1024).toFixed(0)}/{(node.ram.total/1024).toFixed(0)} GB</span></div>
                                                        {swapTotal > 0 && <div>Swap: <span className="text-on-surface font-bold">{(swapUsed/1024).toFixed(0)}/{(swapTotal/1024).toFixed(0)} GB</span></div>}
                                                    </div>
                                                    <div className="flex justify-between px-1 text-[9px] text-on-surface-variant opacity-80">
                                                        <span>Read: <span className="text-on-surface font-bold">{readRate >= 1024 ? `${(readRate/1024).toFixed(1)} MB/s` : `${readRate.toFixed(0)} KB/s`}</span></span>
                                                        <span>Write: <span className="text-on-surface font-bold">{writeRate >= 1024 ? `${(writeRate/1024).toFixed(1)} MB/s` : `${writeRate.toFixed(0)} KB/s`}</span></span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            ) : (
                                /* TABLE VIEW (Neumorphic High Density Table) */
                                <div className="extruded-raised bg-surface rounded-xl overflow-hidden border border-white/5">
                                    <div className="overflow-x-auto">
                                        <table class="w-full border-collapse">
                                            <thead>
                                                <tr className="bg-surface-container-low/50 font-label-mono text-label-mono text-on-surface-variant text-left">
                                                    <th className="p-4 border-b border-outline-variant/25 font-bold uppercase tracking-widest text-[10px]">Node Identity</th>
                                                    <th className="p-4 border-b border-outline-variant/25 font-bold uppercase tracking-widest text-[10px]">System Load</th>
                                                    <th className="p-4 border-b border-outline-variant/25 font-bold uppercase tracking-widest text-[10px]">GPU Status</th>
                                                    <th className="p-4 border-b border-outline-variant/25 font-bold uppercase tracking-widest text-[10px]">vLLM Diagnostics</th>
                                                    <th className="p-4 border-b border-outline-variant/25 font-bold uppercase tracking-widest text-[10px]">Telemetry</th>
                                                </tr>
                                            </thead>
                                            <tbody className="font-label-mono text-label-mono divide-y divide-outline-variant/10">
                                                {Object.keys(metrics.nodes).map(nodeId => {
                                                    const node = metrics.nodes[nodeId];
                                                    const cleanId = nodeId.replace("spark-", "");
                                                    
                                                    if (!node.online) {
                                                        const isSelected = selectedNodeId === nodeId;
                                                        return (
                                                            <tr key={nodeId} 
                                                                onClick={() => setSelectedNodeId(nodeId)}
                                                                className={`cursor-pointer opacity-55 transition-colors ${isSelected ? 'bg-surface-container-high/65 hover:bg-surface-container-high' : 'bg-surface-container-lowest/10 hover:bg-surface-container-low/20'}`}>
                                                                <td className="p-4 font-bold text-red-400 flex items-center gap-2">
                                                                    <span className="material-symbols-outlined text-[16px]">error</span>
                                                                    {cleanId}
                                                                </td>
                                                                <td className="p-4 text-outline-variant italic" colSpan="4">OFFLINE</td>
                                                              </tr>
                                                        );
                                                    }
                                                    
                                                    const ramPerc = node.ram.total ? Math.round((node.ram.used / node.ram.total) * 100) : 0;
                                                    const isGpuOnline = node.gpu && node.gpu.online;
                                                    const vllmOnline = Object.values(metrics.vllm).some(v => v.node_id === nodeId && v.online);
                                                    
                                                    const isSelected = selectedNodeId === nodeId;
                                                    return (
                                                        <tr key={nodeId} 
                                                            onClick={() => setSelectedNodeId(nodeId)}
                                                            className={`cursor-pointer transition-colors group ${isSelected ? 'bg-surface-container-high/65 hover:bg-surface-container-high' : 'hover:bg-surface-container-low'}`}>
                                                            <td className="p-4">
                                                                <div className="flex items-center gap-3">
                                                                    <div className="w-8 h-8 rounded-lg bg-surface-container-high recessed-inset flex items-center justify-center">
                                                                        <span className="material-symbols-outlined text-tertiary text-sm">dns</span>
                                                                    </div>
                                                                    <div>
                                                                        <div className="text-on-surface font-semibold uppercase">{cleanId}</div>
                                                                        <div className="text-[9px] text-on-surface-variant font-mono opacity-60">ID: {nodeId}</div>
                                                                    </div>
                                                                </div>
                                                            </td>
                                                            <td className="p-4">
                                                                <div className="flex gap-4">
                                                                    {HorizontalSteppedGauge({ value: node.cpu, label: "CPU", colorFn: getGoodBadColor, isLightTheme })}
                                                                    {HorizontalSteppedGauge({ value: ramPerc, label: "RAM", colorFn: getGoodBadColor, isLightTheme })}
                                                                </div>
                                                            </td>
                                                            <td className="p-4">
                                                                {isGpuOnline ? (
                                                                    <div className="flex items-center gap-4">
                                                                        <span className="px-2 py-1 bg-surface-container-high rounded text-[9px] border border-tertiary/10 font-bold uppercase">
                                                                            {(node.gpu.gpu_name || "GPU").replace("NVIDIA", "").replace("Accelerator", "").trim()}
                                                                        </span>
                                                                        <div className="flex flex-col gap-1">
                                                                            <span className="text-[10px] text-secondary font-bold font-mono">{node.gpu.temp}\u00b0C / {node.gpu.gpu_util}% Load</span>
                                                                            {HorizontalSteppedGauge({ value: node.gpu.gpu_util, label: "GPU Load", colorFn: getGoodBadColor, isLightTheme })}
                                                                        </div>
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-[9px] text-on-surface-variant opacity-50 uppercase">No GPU</span>
                                                                )}
                                                            </td>
                                                            <td className="p-4">
                                                                <div className="flex items-center gap-2">
                                                                    <span className={`material-symbols-outlined text-sm ${vllmOnline ? 'text-tertiary animate-pulse' : 'text-outline-variant'}`}>
                                                                        {vllmOnline ? "check_circle" : "cancel"}
                                                                    </span>
                                                                    <span className="text-on-surface font-bold uppercase">{vllmOnline ? "ACTIVE" : "INACTIVE"}</span>
                                                                </div>
                                                            </td>
                                                            <td className="p-4 relative">
                                                                <div className="w-full max-w-[120px] spark-line opacity-40 group-hover:opacity-100 transition-opacity"></div>
                                                            </td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    </div>
                                    <div className="p-4 bg-surface-container-lowest flex justify-between items-center text-[9px] border-t border-white/5">
                                        <span className="text-on-surface-variant font-mono">LISTING {onlineNodes} OF {totalNodes} PEER NODES</span>
                                        <div className="flex gap-2">
                                            <button className="px-3 py-1 recessed-inset rounded text-[9px] text-on-surface-variant hover:text-tertiary font-bold transition-all uppercase">Prev</button>
                                            <button className="px-3 py-1 extruded-raised rounded text-[9px] text-tertiary font-bold transition-all uppercase">Next</button>
                                        </div>
                                    </div>
                                </div>
                            )}
                            
                            {/* Selected Node Details (Dockers and Software) */}
                            {selectedNodeId && metrics.nodes[selectedNodeId] && (
                                <div className="extruded-raised bg-surface rounded-xl p-container-padding space-y-6">
                                    <div className="flex justify-between items-center border-b border-outline-variant/15 pb-3">
                                        <div className="flex items-center gap-3">
                                            <span className="material-symbols-outlined text-tertiary text-[20px]">terminal</span>
                                            <h3 className="font-bold text-sm text-on-surface uppercase tracking-wider">
                                                Node {selectedNodeId.replace("spark-", "")} Software & Container Diagnostics
                                            </h3>
                                        </div>
                                        <button onClick={() => setSelectedNodeId(null)}
                                                className="text-on-surface-variant hover:text-red-400 font-label-mono text-[12px] uppercase tracking-wider px-2 py-1 rounded bg-surface-container-high hover:bg-surface-container-highest transition-all border border-white/5">
                                            Close Inspector
                                        </button>
                                    </div>
                                    
                                    {metrics.nodes[selectedNodeId].online ? (
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 font-mono text-[13px]">
                                            {/* Containerized Processes (Docker) */}
                                            <div className="space-y-3">
                                                <h4 className="font-bold text-tertiary uppercase tracking-wider text-[12px] border-b border-white/5 pb-1 flex items-center gap-1.5">
                                                    <span className="material-symbols-outlined text-[15px]">dock</span>
                                                    Docker Containers (Loaded & Unloaded)
                                                </h4>
                                                <div className="divide-y divide-outline-variant/10 max-h-[300px] overflow-y-auto pr-1">
                                                    {metrics.nodes[selectedNodeId].dockers && metrics.nodes[selectedNodeId].dockers.length > 0 ? (
                                                        metrics.nodes[selectedNodeId].dockers.map(d => {
                                                            const isRunning = d.state === "running";
                                                            return (
                                                                <div key={d.name} className="py-2.5 flex justify-between items-center hover:bg-surface-container-low/20 px-1 rounded transition-colors">
                                                                    <div className="flex flex-col gap-0.5 max-w-[70%]">
                                                                        <span className="text-on-surface font-semibold truncate">{d.name}</span>
                                                                        <span className="text-[11px] text-on-surface-variant/75 truncate">{d.image}</span>
                                                                        <span className="text-[11px] text-on-surface-variant/50 truncate">{d.status}</span>
                                                                    </div>
                                                                    <div className="text-right flex flex-col items-end gap-1">
                                                                        <span className={`px-1.5 py-0.5 rounded text-[11px] font-bold ${isRunning ? "bg-tertiary/10 text-tertiary border border-tertiary/20" : "bg-outline-variant/10 text-on-surface-variant/55 border border-outline-variant/10"}`}>
                                                                            {d.state.toUpperCase()}
                                                                        </span>
                                                                        <span className="text-[11px] text-on-surface font-mono opacity-85">
                                                                            Mem: {d.mem_usage.split(" / ")[0]}
                                                                        </span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                    ) : (
                                                        <span className="text-on-surface-variant/50 italic">No Docker containers detected.</span>
                                                    )}
                                                </div>
                                            </div>
                                            
                                            {/* Native Software / Processes */}
                                            <div className="space-y-3">
                                                <h4 className="font-bold text-secondary uppercase tracking-wider text-[12px] border-b border-white/5 pb-1 flex items-center gap-1.5">
                                                    <span className="material-symbols-outlined text-[15px]">settings_applications</span>
                                                    Running Software Services (Memory Footprint)
                                                </h4>
                                                <div className="divide-y divide-outline-variant/10 max-h-[300px] overflow-y-auto pr-1">
                                                    {metrics.nodes[selectedNodeId].hogs && metrics.nodes[selectedNodeId].hogs.length > 0 ? (
                                                        metrics.nodes[selectedNodeId].hogs.map((h, idx) => {
                                                            const ramTotalBytes = (metrics.nodes[selectedNodeId].ram.total || 128000) * 1024 * 1024;
                                                            const estMemBytes = (h.mem / 100) * ramTotalBytes;
                                                            const estMemDisplay = estMemBytes > 1024 * 1024 * 1024
                                                                ? `${(estMemBytes / (1024*1024*1024)).toFixed(1)} GiB`
                                                                : `${(estMemBytes / (1024*1024)).toFixed(0)} MiB`;
                                                                
                                                            return (
                                                                <div key={idx} className="py-2.5 flex justify-between items-center hover:bg-surface-container-low/20 px-1 rounded transition-colors">
                                                                    <div className="flex flex-col gap-0.5">
                                                                        <span className="text-on-surface font-semibold">{h.name}</span>
                                                                        <span className="text-[11px] text-on-surface-variant/50">PID: {h.pid}</span>
                                                                    </div>
                                                                    <div className="text-right flex flex-col items-end gap-0.5">
                                                                        <span className="text-on-surface font-bold">{estMemDisplay}</span>
                                                                        <span className="text-[11px] text-on-surface-variant/65">Share: {h.mem}% RAM</span>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })
                                                    ) : (
                                                        <span className="text-on-surface-variant/50 italic">No software memory footprint data.</span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="py-8 text-center text-on-surface-variant/55 italic">
                                            Node is offline. Diagnostics unavailable.
                                        </div>
                                    )}
                                </div>
                            )}

                        </div>
                    )}
                    

                    
                    {activeTab === "vllm" && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
                            <div className="lg:col-span-2 space-y-6">
                                <h2 className="text-xs font-bold font-mono tracking-widest text-on-surface-variant uppercase flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[18px]">lan</span>
                                    vLLM Models & Generation Status
                                </h2>
                                
                                <div className="space-y-4">
                                    {Object.keys(metrics.vllm).map(modelName => {
                                        const v = metrics.vllm[modelName];
                                        const width = v.online ? `${v.kv_cache_usage}%` : "0%";
                                        return (
                                            <div key={modelName} className="extruded-raised bg-surface p-5 rounded-xl space-y-3">
                                                <div className="flex justify-between items-center text-[11px] font-bold font-mono border-b border-white/5 pb-2">
                                                    <div className="flex flex-col gap-0.5">
                                                        <span className="text-on-surface uppercase tracking-wider">{modelName}</span>
                                                        {v.node_id && (
                                                            <span className="text-[9px] text-on-surface-variant font-mono uppercase opacity-65">
                                                                Host: {v.node_id.replace("spark-", "")}
                                                            </span>
                                                        )}
                                                    </div>
                                                    <span className={`font-black uppercase ${v.online ? "text-tertiary glow-teal" : "text-red-400"}`}>
                                                        {v.online ? "ONLINE" : "OFFLINE"}
                                                    </span>
                                                </div>
                                                
                                                <div className="space-y-2">
                                                    <div className="flex justify-between text-[10px] text-on-surface-variant font-mono">
                                                        <span>KV Cache Allocation</span>
                                                        <span className="font-bold text-on-surface">{v.online ? `${v.kv_cache_usage.toFixed(1)}%` : "0%"}</span>
                                                    </div>
                                                    <div className="h-2 recessed-inset bg-surface-container rounded-full overflow-hidden w-full">
                                                        <div className="h-full bg-tertiary rounded-full transition-[width] duration-700 ease-out" style={{ width }} />
                                                    </div>
                                                </div>
                                                
                                                {v.online && (
                                                    <div className="grid grid-cols-2 gap-4 pt-2 text-[10px] font-mono text-on-surface-variant">
                                                        <div className="bg-surface-container-low p-2 rounded border border-white/5">
                                                            <span>Throughput rate:</span>
                                                            <span className="block text-sm text-on-surface font-bold mt-1">1.2K tok/s</span>
                                                        </div>
                                                        <div className="bg-surface-container-low p-2 rounded border border-white/5">
                                                            <span>Active Requests:</span>
                                                            <span className="block text-sm text-on-surface font-bold mt-1">4 parallel</span>
                                                        </div>
                                                    </div>
                                                )}
                                                
                                                <div className="flex gap-2 pt-2">
                                                    <button onClick={() => setLogModal({ node_id: v.node_id, type: "service", name: "vllm", logs: "Fetching active vLLM telemetry logs..." })}
                                                            className="flex-1 py-1.5 bg-surface-container-high hover:bg-surface-container-highest border border-white/5 text-on-surface-variant text-[10px] font-bold rounded active:scale-95 transition-all uppercase">
                                                        Logs
                                                    </button>
                                                    <button onClick={() => sendControlAction('service', v.node_id, 'vllm', 'restart')}
                                                            className="flex-1 py-1.5 bg-surface-container-high hover:bg-surface-container-highest border border-white/5 text-secondary text-[10px] font-bold rounded active:scale-95 transition-all uppercase">
                                                        Restart
                                                    </button>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            
                            <div className="space-y-6">
                                <h2 className="text-xs font-bold font-mono tracking-widest text-on-surface-variant uppercase flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[18px]">terminal</span>
                                    Live Inference Stream
                                </h2>
                                
                                <div className="extruded-raised bg-surface p-5 rounded-xl space-y-4">
                                    {Object.keys(metrics.nodes).map(nid => {
                                        const n = metrics.nodes[nid];
                                        if (!n.online || !n.chat_loop_diagnostics) return null;
                                        return (
                                            <div key={nid} className="space-y-3">
                                                <span className="text-[10px] font-bold font-mono text-tertiary border-b border-white/5 pb-1 block uppercase">Node {nid.replace("spark-", "")} Generation</span>
                                                <div className="recessed-inset bg-surface-container-lowest/80 p-3 rounded-lg font-mono text-[10px] text-zinc-300 leading-normal space-y-2 select-all max-h-[300px] overflow-y-auto custom-scrollbar">
                                                    <div className="text-tertiary font-bold">USER:</div>
                                                    <p className="bg-black/30 p-2 rounded border border-white/5 opacity-90">{n.chat_loop_diagnostics.latest_prompt || "Idle..."}</p>
                                                    <div className="text-secondary font-bold">GENERATION:</div>
                                                    <p className="bg-black/30 p-2 rounded border border-white/5 opacity-90">{n.chat_loop_diagnostics.latest_response || "Waiting..."}</p>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {activeTab === "queue" && (
                        <div className="space-y-6">
                            <h2 className="text-xs font-bold font-mono tracking-widest text-on-surface-variant uppercase flex items-center gap-2">
                                <span className="material-symbols-outlined text-[18px]">hourglass_empty</span>
                                Priority Scheduler Queue
                            </h2>
                            
                            <div className="extruded-raised bg-surface rounded-xl overflow-hidden border border-white/5">
                                <div className="overflow-x-auto">
                                    <table className="w-full border-collapse">
                                        <thead>
                                            <tr className="bg-surface-container-low/50 font-label-mono text-label-mono text-on-surface-variant text-left">
                                                <th className="p-4 border-b border-outline-variant/25 font-bold uppercase tracking-widest text-[10px]">Model Instance</th>
                                                <th className="p-4 border-b border-outline-variant/25 font-bold uppercase tracking-widest text-[10px]">Job Task ID</th>
                                                <th className="p-4 border-b border-outline-variant/25 font-bold uppercase tracking-widest text-[10px]">Active Status</th>
                                                <th className="p-4 border-b border-outline-variant/25 font-bold uppercase tracking-widest text-[10px] text-right">Actions</th>
                                            </tr>
                                        </thead>
                                        <tbody className="font-label-mono text-label-mono divide-y divide-outline-variant/10">
                                            {metrics.queue.active && metrics.queue.active.length > 0 ? (
                                                metrics.queue.active.map(job => (
                                                    <tr key={job.task_id || job.id} className="hover:bg-surface-container-low transition-colors">
                                                        <td className="p-4 font-bold text-on-surface">{job.model || "Hermes-3-70B"}</td>
                                                        <td className="p-4 font-mono text-outline">{job.task_id || job.id}</td>
                                                        <td className="p-4">
                                                            <span className="px-2 py-0.5 bg-tertiary/10 border border-tertiary/20 text-tertiary rounded text-[9px] font-bold uppercase">{job.status}</span>
                                                        </td>
                                                        <td className="p-4 text-right">
                                                            <button onClick={() => cancelQueueTask(job.task_id || job.id)}
                                                                    className="px-3 py-1 bg-surface-container-high hover:bg-surface-container-highest border border-red-500/20 text-red-400 text-[9px] font-bold rounded uppercase active:scale-95 transition-all shadow-[1px_1px_3px_var(--shadow-dark)]">
                                                                Cancel
                                                            </button>
                                                        </td>
                                                    </tr>
                                                ))
                                            ) : (
                                                <tr>
                                                    <td className="p-8 text-center text-on-surface-variant font-mono italic" colSpan="4">
                                                        No active pipeline tasks in queue.
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    )}
                    
                    {activeTab === "containers" && (
                        <div className="space-y-6">
                            <h2 className="text-xs font-bold font-mono tracking-widest text-on-surface-variant uppercase flex items-center gap-2">
                                <span className="material-symbols-outlined text-[18px]">dns</span>
                                Cluster Workload Containers
                            </h2>
                            
                            <div className="space-y-8">
                                {Object.keys(metrics.nodes).map(nodeId => {
                                    const node = metrics.nodes[nodeId];
                                    if (!node.online || !node.dockers || node.dockers.length === 0) return null;
                                    const cleanId = nodeId.replace("spark-", "");
                                    
                                    return (
                                        <div key={nodeId} className="space-y-3 border-l-2 border-tertiary/30 pl-4">
                                            <h3 className="font-bold text-[11px] text-tertiary tracking-wider font-mono uppercase">Node {cleanId} Container Services</h3>
                                            
                                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                                {node.dockers.map(d => {
                                                    const ramUsed = d.mem_usage.includes('/') ? d.mem_usage.split('/')[0].trim() : d.mem_usage;
                                                    const totalRam = d.mem_usage.includes('/') ? d.mem_usage.split('/')[1].trim() : '';
                                                    const ramLabel = totalRam ? `${ramUsed} / ${totalRam}` : ramUsed;
                                                    const isRunning = d.state === "running";
                                                    
                                                    return (
                                                        <div key={d.name} className="extruded-raised bg-surface p-4 rounded-xl flex flex-col justify-between gap-3">
                                                            <div className="flex justify-between items-start border-b border-white/5 pb-2">
                                                                <div>
                                                                    <div className="font-bold text-on-surface text-[11px]">{d.name}</div>
                                                                    <div className="text-[9px] text-on-surface-variant font-mono truncate max-w-[130px]" title={d.image}>{d.image.split(':')[0]}</div>
                                                                </div>
                                                                <div className="flex items-center gap-1.5">
                                                                    <span className={`w-1.5 h-1.5 rounded-full ${isRunning ? "bg-emerald-400" : "bg-red-400"}`}></span>
                                                                    <span className="font-mono text-outline leading-none text-[8px] uppercase">{d.status}</span>
                                                                </div>
                                                            </div>
                                                            
                                                            {isRunning && (
                                                                <div className="bg-surface-container-low p-2 rounded border border-white/5 text-[9px] font-mono text-on-surface-variant flex justify-between items-center">
                                                                    <span>CPU: <span className="text-on-surface font-bold">{d.cpu_perc}</span></span>
                                                                    <span>RAM: <span className="text-on-surface font-bold">{ramLabel}</span></span>
                                                                </div>
                                                            )}
                                                            
                                                            <div className="flex gap-2 justify-between">
                                                                <button onClick={() => setLogModal({ node_id: nodeId, type: "docker", name: d.name, logs: "Loading container logs..." })} 
                                                                        className="flex-grow py-1 bg-surface-container-high hover:bg-surface-container-highest border border-white/5 text-on-surface-variant text-[9px] font-bold rounded active:scale-95 transition-all uppercase text-center">
                                                                    Logs
                                                                </button>
                                                                <button onClick={() => sendControlAction('container', nodeId, d.name, 'restart')} 
                                                                        className="flex-grow py-1 bg-surface-container-high hover:bg-surface-container-highest border border-white/5 text-secondary text-[9px] font-bold rounded active:scale-95 transition-all uppercase text-center">
                                                                    Restart
                                                                </button>
                                                                {isRunning ? (
                                                                    <button onClick={() => sendControlAction('container', nodeId, d.name, 'stop')} 
                                                                            className="flex-grow py-1 bg-red-950/20 hover:bg-red-950/45 border border-red-500/20 text-red-400 text-[9px] font-bold rounded active:scale-95 transition-all uppercase text-center">
                                                                        Stop
                                                                    </button>
                                                                ) : (
                                                                    <button onClick={() => sendControlAction('container', nodeId, d.name, 'start')} 
                                                                            className="flex-grow py-1 bg-emerald-950/20 hover:bg-emerald-950/45 border border-emerald-500/20 text-emerald-400 text-[9px] font-bold rounded active:scale-95 transition-all uppercase text-center">
                                                                        Start
                                                                    </button>
                                                                )}
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                    
                    {activeTab === "psi" && (
                        <div className="grid grid-cols-1 lg:grid-cols-3 gap-gutter">
                            <div className="lg:col-span-2 space-y-6">
                                <h2 className="text-xs font-bold font-mono tracking-widest text-on-surface-variant uppercase flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[18px]">speed</span>
                                    System Pressure & Swap Thrashing Monitors
                                </h2>
                                
                                <div className="space-y-4">
                                    {Object.keys(metrics.nodes).map(nodeId => {
                                        const node = metrics.nodes[nodeId];
                                        if (!node.online) return null;
                                        const cleanId = nodeId.replace("spark-", "");
                                        
                                        const psiSome = (node.psi_memory && node.psi_memory.some_avg10) || 0.0;
                                        const psiFull = (node.psi_memory && node.psi_memory.full_avg10) || 0.0;
                                        const swapIn = (node.swap_rates && node.swap_rates.in) || 0.0;
                                        const swapOut = (node.swap_rates && node.swap_rates.out) || 0.0;
                                        
                                        return (
                                            <div key={nodeId} className="extruded-raised bg-surface p-5 rounded-xl space-y-4">
                                                <span className="font-bold font-mono text-tertiary block border-b border-white/5 pb-2 uppercase">Node {cleanId} Stall telemetry</span>
                                                
                                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                    <div className="bg-surface-container-low p-3 rounded-lg border border-white/5 space-y-1">
                                                        <span className="text-[9px] uppercase font-bold text-outline">Memory PSI (Some)</span>
                                                        <div className="flex justify-between items-baseline">
                                                            <span className="text-lg font-mono font-bold text-on-surface">{psiSome}%</span>
                                                            <span className="text-[9px] text-on-surface-variant">avg10</span>
                                                        </div>
                                                        <div className="h-1 bg-surface-container-highest rounded-full overflow-hidden">
                                                            <div className="h-full bg-tertiary" style={{ width: `${Math.min(100, psiSome*5)}%` }}></div>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="bg-surface-container-low p-3 rounded-lg border border-white/5 space-y-1">
                                                        <span className="text-[9px] uppercase font-bold text-outline">Memory PSI (Full)</span>
                                                        <div className="flex justify-between items-baseline">
                                                            <span className="text-lg font-mono font-bold text-on-surface">{psiFull}%</span>
                                                            <span className="text-[9px] text-on-surface-variant">avg10</span>
                                                        </div>
                                                        <div className="h-1 bg-surface-container-highest rounded-full overflow-hidden">
                                                            <div className="h-full bg-tertiary" style={{ width: `${Math.min(100, psiFull*10)}%` }}></div>
                                                        </div>
                                                    </div>
                                                </div>
                                                
                                                <div className="grid grid-cols-2 gap-4 pt-2 text-[10px] font-mono text-on-surface-variant bg-surface-container-lowest/50 p-3 rounded border border-white/5">
                                                    <div>Swap In Rate: <span className="text-on-surface font-bold">{swapIn.toFixed(1)} pages/s</span></div>
                                                    <div>Swap Out Rate: <span className="text-on-surface font-bold">{swapOut.toFixed(1)} pages/s</span></div>
                                                    <div className="col-span-2 border-t border-white/5 pt-2 mt-1 flex justify-between">
                                                        <span>Status Diagnostics:</span>
                                                        <span className={psiSome > 10 ? "text-red-400 font-bold uppercase animate-pulse" : "text-tertiary uppercase font-bold"}>
                                                            {psiSome > 10 ? "PRESSURE WARNING" : "PRESSURE STABLE"}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                            
                            <div className="space-y-6">
                                <h2 className="text-xs font-bold font-mono tracking-widest text-on-surface-variant uppercase flex items-center gap-2">
                                    <span className="material-symbols-outlined text-[18px]">terminal</span>
                                    System Kernel Log Outputs
                                </h2>
                                
                                <div className="extruded-raised bg-surface p-5 rounded-xl space-y-4">
                                    {Object.keys(metrics.nodes).map(nodeId => {
                                        const node = metrics.nodes[nodeId];
                                        if (!node.online) return null;
                                        const cleanId = nodeId.replace("spark-", "");
                                        
                                        return (
                                            <div key={nodeId} className="space-y-2">
                                                <span className="text-[10px] font-bold font-mono text-outline block uppercase">dmesg outputs on Node {cleanId}</span>
                                                <button onClick={() => setLogModal({ node_id: nodeId, type: "service", name: "dmesg", logs: "Streaming system logs..." })}
                                                        className="w-full py-2 bg-surface-container-high hover:bg-surface-container-highest rounded-lg text-label-mono text-on-surface-variant hover:text-tertiary transition-all border border-white/5 text-[10px] uppercase font-bold text-center active:scale-95 shadow-[1px_1px_3px_var(--shadow-dark)]">
                                                    Inspect dmesg Kernel Logs
                                                </button>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    )}
                    
                </div>
                
                {/* Footer Section */}
                <footer className="w-full py-4 px-margin-desktop bg-surface-container-lowest flex justify-between items-center border-t border-white/5 z-40">
                    <span className="font-label-mono text-label-mono text-on-surface-variant">\u00a9 2024 Multi-Spark OS. Telemetry Engine Active.</span>
                    <div className="flex gap-6">
                        <a className="font-label-mono text-label-mono text-on-surface-variant hover:text-secondary transition-colors cursor-pointer" href="#">Legal</a>
                        <a className="font-label-mono text-label-mono text-on-surface-variant hover:text-secondary transition-colors cursor-pointer" href="#">Telemetry Docs</a>
                        <a className="font-label-mono text-label-mono text-on-surface-variant hover:text-secondary transition-colors cursor-pointer" href="#">Security API</a>
                    </div>
                </footer>
            </main>
            
            {/* Modal Logs Terminal */}
            {logModal && (
                <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[90] flex items-center justify-center p-4 md:p-6 transition-all duration-300">
                    <div className="extruded-raised w-full max-w-[800px] bg-[#0c0c0e] text-zinc-300 shadow-2xl flex flex-col h-[520px] overflow-hidden rounded-xl">
                        {/* Modal Header */}
                        <div className="px-5 py-4 border-b border-outline-variant/30 flex justify-between items-center bg-[#141416]">
                            <div className="flex items-center gap-3">
                                <span className="w-1.5 h-1.5 bg-tertiary rounded-full animate-ping"></span>
                                <h3 className="text-[10px] font-bold tracking-widest text-zinc-200 uppercase font-mono">
                                    [LOG STREAM] {logModal.node_id.replace("spark-", "")} // {logModal.name}
                                </h3>
                            </div>
                            <button onClick={() => setLogModal(null)} 
                                    className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-750 text-zinc-300 text-xs font-bold rounded border border-zinc-700 active:scale-95 transition-all">
                                Close
                            </button>
                        </div>
                        {/* Terminal Body */}
                        <div className="flex-grow p-4 overflow-y-auto font-mono text-[10px] text-zinc-300 leading-relaxed bg-[#060608] custom-scrollbar select-all">
                            {logModal.logs ? (
                                <pre className="whitespace-pre-wrap">{logModal.logs}</pre>
                            ) : (
                                <div className="flex items-center justify-center h-full">
                                    <div className="w-5 h-5 border-2 border-t-tertiary border-r-transparent border-b-tertiary border-l-transparent rounded-full animate-spin"></div>
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
