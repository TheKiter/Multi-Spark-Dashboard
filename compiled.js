/* app.js - Hermes Mission Control & Spark Cluster Dashboard */

const API_URL = "/api/metrics";
const CONTROL_CONTAINER_URL = "/api/control/container";
const CONTROL_SERVICE_URL = "/api/control/service";
const CONTROL_LOGS_URL = "/api/control/logs";
const CONTROL_TASK_CANCEL_URL = "/api/control/task/cancel";
const HERMES_DIRECTIVE_URL = "/api/hermes/directive";
const HERMES_SESSIONS_URL = "/api/hermes/sessions";
const HERMES_ACTIVITY_URL = "/api/hermes/activity";
const HERMES_TASKS_URL = "/api/hermes/tasks";
const HERMES_CRON_URL = "/api/hermes/cron";
const HERMES_CONTENT_URL = "/api/hermes/content";
const HERMES_CONTENT_FILE_URL = "/api/hermes/content/file";

// Quantized 10% step HSL color mappings
function getGoodBadColor(percentage) {
  const step = Math.round(percentage / 10) * 10;
  const h = Math.max(0, 159 - step * 1.69);
  return `hsl(${h}, 70%, 48%)`;
}
function getStrongWeakColor(percentage) {
  const step = Math.round(percentage / 10) * 10;
  const h = Math.max(38, 217 - step * 1.79);
  return `hsl(${h}, 65%, 52%)`;
}

// Simple Markdown Renderer
function renderMarkdown(text) {
  if (!text) return "";
  let html = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

  // Replace headers
  html = html.replace(/^# (.*?)$/gm, '<h1 class="text-xl font-extrabold text-tertiary mt-4 mb-2">$1</h1>');
  html = html.replace(/^## (.*?)$/gm, '<h2 class="text-base font-bold text-on-surface mt-3 mb-1.5 border-b border-white/5 pb-1">$1</h2>');
  html = html.replace(/^### (.*?)$/gm, '<h3 class="text-sm font-semibold text-secondary mt-2.5 mb-1">$1</h3>');

  // Replace bold
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong class="font-bold text-white">$1</strong>');

  // Replace lists
  html = html.replace(/^\s*-\s+(.*?)$/gm, '<li class="ml-4 list-disc text-zinc-300">$1</li>');

  // Replace code blocks
  html = html.replace(/```([\s\S]*?)```/g, '<pre class="bg-black/40 p-3 rounded-lg border border-white/5 font-mono text-[10px] text-zinc-300 my-2 overflow-x-auto whitespace-pre-wrap">$1</pre>');
  html = html.replace(/`(.*?)`/g, '<code class="bg-black/30 px-1 py-0.5 rounded font-mono text-[10px] text-secondary">$1</code>');

  // Obsidian links
  html = html.replace(/\[\[(.*?)\]\]/g, '<span class="text-tertiary cursor-pointer hover:underline">[[ $1 ]]</span>');

  // Obsidian Callouts
  html = html.replace(/^&gt;\s*\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]([\s\S]*?)(?=\n\n|\n$|$)/gim, (match, type, content) => {
    let colorClass = "border-sky-500 bg-sky-950/10 text-sky-300";
    if (type.toUpperCase() === "WARNING" || type.toUpperCase() === "CAUTION") colorClass = "border-red-500 bg-red-950/10 text-red-300";
    if (type.toUpperCase() === "IMPORTANT") colorClass = "border-amber-500 bg-amber-950/10 text-amber-300";
    if (type.toUpperCase() === "TIP") colorClass = "border-emerald-500 bg-emerald-950/10 text-emerald-300";
    const cleanContent = content.replace(/^&gt;\s?/gm, "").trim();
    return `<div class="border-l-4 p-3 rounded-r-lg my-3 ${colorClass}"><strong class="uppercase text-[10px] tracking-wider block font-bold mb-1">${type}</strong>${cleanContent}</div>`;
  });

  // Replace paragraph returns
  html = html.replace(/\n\n/g, '<div class="h-3"></div>');
  return html;
}

// 10-Segment Vertical Gauge
const CircularGauge = ({
  value,
  maxVal = 100,
  label,
  suffix = "%",
  colorFn,
  isLightTheme
}) => {
  const perc = Math.max(0, Math.min(100, Math.round(value / maxVal * 100)));
  const activeSegments = Math.round(perc / 10);
  const segments = [];
  for (let i = 9; i >= 0; i--) {
    const isActive = i < activeSegments;
    const segmentPercent = (i + 1) * 10;
    const color = isActive ? colorFn(segmentPercent) : isLightTheme ? '#e8d4cc' : '#272a2e';
    segments.push(/*#__PURE__*/React.createElement("div", {
      key: i,
      className: "h-1.5 w-6 rounded-sm transition-all duration-300",
      style: {
        backgroundColor: color
      }
    }));
  }
  return /*#__PURE__*/React.createElement("div", {
    className: "gauge-item flex flex-col items-center gap-1 flex-1 select-none"
  }, /*#__PURE__*/React.createElement("span", {
    className: "text-[9px] font-bold font-mono text-on-surface opacity-80"
  }, value, suffix), /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col gap-[2px] p-[2px] recessed-inset bg-surface-container-low rounded-md overflow-hidden"
  }, segments), /*#__PURE__*/React.createElement("span", {
    className: "text-[8px] font-mono tracking-wider text-on-surface-variant font-bold uppercase mt-1 opacity-70"
  }, label));
};

// 10-Segment Horizontal Gauge
const HorizontalSteppedGauge = ({
  value,
  maxVal = 100,
  label,
  colorFn,
  isLightTheme
}) => {
  const perc = Math.max(0, Math.min(100, Math.round(value / maxVal * 100)));
  const activeSegments = Math.round(perc / 10);
  return /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col gap-1 w-24"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between text-[9px] text-on-surface-variant font-mono"
  }, /*#__PURE__*/React.createElement("span", null, label), /*#__PURE__*/React.createElement("span", null, value, "%")), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-[2px] h-1.5 p-[1px] recessed-inset bg-surface-container rounded-sm overflow-hidden w-full"
  }, [...Array(10)].map((_, i) => {
    const isActive = i < activeSegments;
    const segmentPercent = (i + 1) * 10;
    const color = isActive ? colorFn(segmentPercent) : isLightTheme ? '#e8d4cc' : '#272a2e';
    return /*#__PURE__*/React.createElement("div", {
      key: i,
      className: "h-full flex-1 rounded-[1px] transition-all",
      style: {
        backgroundColor: color
      }
    });
  })));
};
const App = () => {
  // UI Layout Configuration States
  const [theme, setTheme] = React.useState(() => localStorage.getItem("spark-theme") || "dark");
  const [zoom, setZoom] = React.useState(() => parseFloat(localStorage.getItem("spark-zoom") || "0.85"));
  const [activeTab, setActiveTab] = React.useState("overview");
  const [sparkSubTab, setSparkSubTab] = React.useState("all-nodes");
  const [viewMode, setViewMode] = React.useState("table");
  const [dismissedAlarms, setDismissedAlarms] = React.useState(new Set());
  const [clock, setClock] = React.useState("00:00:00");
  const [isUpdating, setIsUpdating] = React.useState(false);

  // Core Data States
  const [metrics, setMetrics] = React.useState(null);
  const [directive, setDirective] = React.useState("Coordinating agent collective operations.");
  const [activity, setActivity] = React.useState([]);
  const [sessions, setSessions] = React.useState([]);
  const [tasks, setTasks] = React.useState([]);
  const [cronJobs, setCronJobs] = React.useState([]);
  const [vaultFiles, setVaultFiles] = React.useState([]);

  // Interactive states
  const [selectedFile, setSelectedFile] = React.useState(null);
  const [fileContent, setFileContent] = React.useState("");
  const [fileLoading, setFileLoading] = React.useState(false);
  const [isEditingDirective, setIsEditingDirective] = React.useState(false);
  const [directiveInput, setDirectiveInput] = React.useState("");
  const [selectedTask, setSelectedTask] = React.useState(null);
  const [logModal, setLogModal] = React.useState(null);
  const [contentFilter, setContentFilter] = React.useState("all");
  const [contentSearch, setContentSearch] = React.useState("");

  // Interval timers
  const logIntervalRef = React.useRef(null);

  // Live clock update
  React.useEffect(() => {
    const timer = setInterval(() => {
      const now = new Date();
      setClock(now.toTimeString().split(' ')[0]);
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Fetch telemetry from server
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

  // Fetch Hermes specific endpoints
  const fetchHermesData = async () => {
    try {
      // Directive
      const dirRes = await fetch(HERMES_DIRECTIVE_URL);
      const dirData = await dirRes.json();
      setDirective(dirData.directive);
      if (!isEditingDirective) setDirectiveInput(dirData.directive);

      // Activity feed
      const actRes = await fetch(HERMES_ACTIVITY_URL);
      const actData = await actRes.json();
      setActivity(actData.activity || []);

      // Sessions
      const sessRes = await fetch(HERMES_SESSIONS_URL);
      const sessData = await sessRes.json();
      setSessions(sessData.sessions || []);

      // Kanban Tasks
      const tasksRes = await fetch(HERMES_TASKS_URL);
      const tasksData = await tasksRes.json();
      setTasks(tasksData.tasks || []);

      // Cron Jobs
      const cronRes = await fetch(HERMES_CRON_URL);
      const cronData = await cronRes.json();
      setCronJobs(cronData.jobs || []);

      // Vault files list
      const contentRes = await fetch(HERMES_CONTENT_URL);
      const contentData = await contentRes.json();
      setVaultFiles(contentData.files || []);
    } catch (e) {
      console.error("Failed fetching Hermes data:", e);
    }
  };

  // Lifecycle setups
  React.useEffect(() => {
    fetchTelemetry();
    fetchHermesData();
    const telemetryPoll = setInterval(fetchTelemetry, 2500);
    const hermesPoll = setInterval(fetchHermesData, 5000);
    return () => {
      clearInterval(telemetryPoll);
      clearInterval(hermesPoll);
    };
  }, []);

  // File content fetching handler
  const viewFile = async filepath => {
    try {
      setFileLoading(true);
      setSelectedFile(filepath);
      const res = await fetch(`${HERMES_CONTENT_FILE_URL}?path=${encodeURIComponent(filepath)}`);
      const data = await res.json();
      setFileContent(data.content || "Empty document.");
    } catch (e) {
      setFileContent(`Error loading file: ${e.message}`);
    } finally {
      setFileLoading(false);
    }
  };

  // Saving directive
  const saveDirective = async () => {
    try {
      const res = await fetch(HERMES_DIRECTIVE_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          directive: directiveInput
        })
      });
      const data = await res.json();
      if (data.status === "success") {
        setDirective(directiveInput);
        setIsEditingDirective(false);
      } else {
        alert("Failed: " + data.error);
      }
    } catch (e) {
      alert("Error saving directive: " + e.message);
    }
  };

  // Log polling modal handler
  React.useEffect(() => {
    if (logModal) {
      const pollLogs = async () => {
        try {
          const res = await fetch(`${CONTROL_LOGS_URL}?node_id=${logModal.node_id}&type=${logModal.type}&name=${logModal.name}`);
          const data = await res.json();
          setLogModal(prev => prev ? {
            ...prev,
            logs: data.logs
          } : null);
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

  // Zoom state mapping
  React.useEffect(() => {
    document.body.style.zoom = zoom;
    localStorage.setItem("spark-zoom", zoom.toString());
  }, [zoom]);

  // Control actions
  const sendControlAction = async (type, nodeId, name, action) => {
    const verb = action === "stop" ? "STOP/KILL" : action === "restart" ? "RESTART" : "START";
    if (!confirm(`Trigger ${verb} on ${name} (${nodeId})?`)) return;
    try {
      const url = type === "container" ? CONTROL_CONTAINER_URL : CONTROL_SERVICE_URL;
      const body = type === "container" ? {
        node_id: nodeId,
        container_name: name,
        action
      } : {
        node_id: nodeId,
        service_name: name,
        action
      };
      const res = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(body)
      });
      const data = await res.json();
      alert(data.status || data.error || "Action completed.");
      fetchTelemetry();
    } catch (e) {
      alert("Failed to send action: " + e.message);
    }
  };
  const cancelQueueTask = async taskId => {
    if (!confirm(`Cancel task ${taskId}?`)) return;
    try {
      const res = await fetch(CONTROL_TASK_CANCEL_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          task_id: taskId
        })
      });
      const data = await res.json();
      alert(data.status || data.error || "Task cancelled.");
      fetchTelemetry();
    } catch (e) {
      alert("Failed to cancel task: " + e.message);
    }
  };
  const dismissAlarm = logText => {
    setDismissedAlarms(prev => {
      const updated = new Set(prev);
      updated.add(logText);
      return updated;
    });
  };
  if (!metrics) {
    return /*#__PURE__*/React.createElement("div", {
      className: "flex items-center justify-center min-h-screen bg-surface"
    }, /*#__PURE__*/React.createElement("div", {
      className: "text-center"
    }, /*#__PURE__*/React.createElement("div", {
      className: "inline-block w-8 h-8 border-2 border-t-tertiary border-r-transparent border-b-tertiary border-l-transparent rounded-full animate-spin"
    }), /*#__PURE__*/React.createElement("div", {
      className: "mt-4 text-on-surface-variant text-[11px] tracking-widest font-mono font-medium uppercase"
    }, "MISSION CONTROL LOAD SEQUENCE...")));
  }
  const isLightTheme = theme === "light";
  const nodeIds = Object.keys(metrics.nodes);

  // Core telemetry aggregations
  const onlineNodes = nodeIds.filter(nid => metrics.nodes[nid].online).length;
  const gpuNodes = nodeIds.filter(nid => metrics.nodes[nid].online && metrics.nodes[nid].gpu && metrics.nodes[nid].gpu.online);
  const avgGpuLoad = gpuNodes.length ? Math.round(gpuNodes.reduce((acc, nid) => acc + metrics.nodes[nid].gpu.gpu_util, 0) / gpuNodes.length) : 0;
  const activeModels = Object.keys(metrics.vllm).filter(m => metrics.vllm[m].online);
  const avgKvCache = activeModels.length ? Math.round(activeModels.reduce((acc, m) => acc + metrics.vllm[m].kv_cache_usage, 0) / activeModels.length) : 0;

  // Alarms evaluation
  let activeAlarm = null;
  for (const nid in metrics.nodes) {
    const n = metrics.nodes[nid];
    if (n.online && n.oom_events && n.oom_events.length > 0) {
      const latest = n.oom_events[n.oom_events.length - 1];
      const logText = `[${nid}] ${latest.text}`;
      if (!dismissedAlarms.has(logText)) {
        activeAlarm = {
          type: "oom",
          node: nid,
          text: latest.text,
          logText
        };
        break;
      }
    }
  }

  // Identify agent information from state database
  const agentKeys = ["scout", "scribe", "reach", "dev", "orchestrator"];
  const agentMetadata = {
    orchestrator: {
      name: "Orchestrator",
      color: "text-violet-400 bg-violet-950/20 border-violet-500/30",
      platform: "Telegram",
      role: "Coordination"
    },
    scout: {
      name: "Scout",
      color: "text-emerald-400 bg-emerald-950/20 border-emerald-500/30",
      platform: "Discord",
      role: "Research"
    },
    scribe: {
      name: "Scribe",
      color: "text-amber-400 bg-amber-950/20 border-amber-500/30",
      platform: "Discord",
      role: "Content Production"
    },
    reach: {
      name: "Reach",
      color: "text-rose-400 bg-rose-950/20 border-rose-500/30",
      platform: "Discord",
      role: "Marketing & Growth"
    },
    dev: {
      name: "Dev",
      color: "text-indigo-400 bg-indigo-950/20 border-indigo-500/30",
      platform: "Discord",
      role: "Engineering"
    }
  };

  // Calculate aggregated stats for each agent
  const agentsStats = agentKeys.reduce((acc, k) => {
    const meta = agentMetadata[k];
    const agentSessions = sessions.filter(s => {
      const prompt = (s.system_prompt || "").toLowerCase();
      const title = (s.title || "").toLowerCase();
      return prompt.includes(k) || title.includes(k) || s.source === meta.platform;
    });
    const totalMsg = agentSessions.reduce((sum, s) => sum + (s.message_count || 0), 0);
    const lastSession = agentSessions.length > 0 ? agentSessions[0] : null;
    acc[k] = {
      ...meta,
      sessionCount: agentSessions.length,
      messageCount: totalMsg,
      model: lastSession ? lastSession.model : "hermes3:70b",
      lastActive: lastSession ? lastSession.started_at : 0,
      activeSessionId: lastSession ? lastSession.id : "None"
    };
    return acc;
  }, {});
  return /*#__PURE__*/React.createElement("div", {
    className: "min-h-screen flex text-on-surface"
  }, /*#__PURE__*/React.createElement("aside", {
    className: "h-screen w-64 fixed left-0 top-0 bg-surface flex flex-col p-gutter space-y-4 shadow-[8px_0_16px_var(--shadow-dark)] z-[60] border-r border-white/5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "mb-6"
  }, /*#__PURE__*/React.createElement("h1", {
    className: "font-headline-sm text-headline-sm font-black text-tertiary glow-teal tracking-widest uppercase"
  }, "HERMES CENTRAL"), /*#__PURE__*/React.createElement("p", {
    className: "font-label-mono text-[9px] text-on-surface-variant opacity-60"
  }, "SPARK-8828 CONTROL INTERFACE v2.1")), /*#__PURE__*/React.createElement("nav", {
    className: "flex-grow space-y-1.5 select-none"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-mono text-[9px] tracking-widest text-on-surface-variant/40 block px-4 py-1 uppercase font-bold"
  }, "Crew Command"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setActiveTab("overview"),
    className: `w-full flex items-center gap-3 px-4 py-2.5 rounded-lg font-label-mono text-label-mono transition-all text-left ${activeTab === "overview" ? 'bg-surface-container-high text-tertiary shadow-[inset_4px_4px_8px_var(--shadow-dark),inset_-4px_-4px_8px_var(--shadow-light)]' : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined text-[18px]"
  }, "dashboard"), /*#__PURE__*/React.createElement("span", null, "Ops Overview")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setActiveTab("agents"),
    className: `w-full flex items-center gap-3 px-4 py-2.5 rounded-lg font-label-mono text-label-mono transition-all text-left ${activeTab === "agents" ? 'bg-surface-container-high text-tertiary shadow-[inset_4px_4px_8px_var(--shadow-dark),inset_-4px_-4px_8px_var(--shadow-light)]' : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined text-[18px]"
  }, "group"), /*#__PURE__*/React.createElement("span", null, "The Collective")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setActiveTab("tasks"),
    className: `w-full flex items-center gap-3 px-4 py-2.5 rounded-lg font-label-mono text-label-mono transition-all text-left ${activeTab === "tasks" ? 'bg-surface-container-high text-tertiary shadow-[inset_4px_4px_8px_var(--shadow-dark),inset_-4px_-4px_8px_var(--shadow-light)]' : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined text-[18px]"
  }, "assignment"), /*#__PURE__*/React.createElement("span", null, "Task Board")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setActiveTab("schedule"),
    className: `w-full flex items-center gap-3 px-4 py-2.5 rounded-lg font-label-mono text-label-mono transition-all text-left ${activeTab === "schedule" ? 'bg-surface-container-high text-tertiary shadow-[inset_4px_4px_8px_var(--shadow-dark),inset_-4px_-4px_8px_var(--shadow-light)] font-medium' : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined text-[18px]"
  }, "schedule"), /*#__PURE__*/React.createElement("span", null, "Scheduler")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setActiveTab("content"),
    className: `w-full flex items-center gap-3 px-4 py-2.5 rounded-lg font-label-mono text-label-mono transition-all text-left ${activeTab === "content" ? 'bg-surface-container-high text-tertiary shadow-[inset_4px_4px_8px_var(--shadow-dark),inset_-4px_-4px_8px_var(--shadow-light)] font-medium' : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}`
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined text-[18px]"
  }, "folder_shared"), /*#__PURE__*/React.createElement("span", null, "Content Library")), /*#__PURE__*/React.createElement("div", {
    className: "h-[1px] bg-white/5 my-4"
  }), /*#__PURE__*/React.createElement("span", {
    className: "font-mono text-[9px] tracking-widest text-on-surface-variant/40 block px-4 py-1 uppercase font-bold"
  }, "Spark Telemetry"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setActiveTab("spark"),
    className: `w-full flex items-center justify-between px-4 py-2.5 rounded-lg font-label-mono text-label-mono transition-all text-left ${activeTab === "spark" ? 'bg-surface-container-high text-secondary shadow-[inset_4px_4px_8px_var(--shadow-dark),inset_-4px_-4px_8px_var(--shadow-light)] font-bold' : 'text-on-surface-variant hover:bg-surface-container-low hover:text-on-surface'}`
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-3"
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined text-[18px]"
  }, "dns"), /*#__PURE__*/React.createElement("span", null, "Cluster Stats")), /*#__PURE__*/React.createElement("span", {
    className: "text-[8px] bg-sky-500/10 border border-sky-500/20 text-sky-400 px-1.5 py-0.5 rounded font-mono font-bold"
  }, "LIVE"))), /*#__PURE__*/React.createElement("div", {
    className: "pt-4 border-t border-outline-variant/30 flex flex-col gap-2"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => window.print(),
    className: "w-full extruded-raised bg-surface-container-high text-tertiary font-label-mono text-label-mono py-2 rounded-lg active:shadow-[inset_4px_4px_8px_var(--shadow-dark)] active:scale-95 transition-all text-center"
  }, "Print Console"), /*#__PURE__*/React.createElement("button", {
    onClick: () => {
      const jsonStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify({
        telemetry: metrics,
        hermes: {
          sessions,
          tasks,
          cronJobs,
          directive
        }
      }, null, 2));
      const dlAnchor = document.createElement('a');
      dlAnchor.setAttribute("href", jsonStr);
      dlAnchor.setAttribute("download", `hermes_mission_control_dump_${Date.now()}.json`);
      dlAnchor.click();
    },
    className: "w-full text-center text-[10px] text-on-surface-variant hover:text-tertiary font-label-mono tracking-wider py-1 border border-transparent hover:border-tertiary/10 rounded"
  }, "EXPORT FULL CORE DATA"))), /*#__PURE__*/React.createElement("main", {
    className: "ml-64 min-h-screen flex flex-col flex-1"
  }, /*#__PURE__*/React.createElement("header", {
    className: "w-full h-16 flex justify-between items-center px-margin-desktop sticky top-0 z-50 bg-surface/85 backdrop-blur-md shadow-[8px_8px_16px_var(--shadow-dark)] border-b border-white/5"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-4"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-headline-md text-headline-md font-extrabold text-tertiary drop-shadow-[0_0_8px_var(--glow-color-teal)] uppercase tracking-wider"
  }, activeTab === "spark" ? `Cluster // ${sparkSubTab.replace("-", " ")}` : activeTab.replace("-", " ")), /*#__PURE__*/React.createElement("div", {
    className: "recessed-inset bg-surface-container-low rounded-full px-4 py-1 flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined text-on-surface-variant text-[16px]"
  }, "schedule"), /*#__PURE__*/React.createElement("span", {
    className: "text-label-mono font-label-mono text-on-surface-variant font-bold"
  }, clock))), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 bg-surface-container-low px-3 py-1.5 rounded-lg border border-white/5 shadow-[2px_2px_4px_var(--shadow-dark)]"
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined text-[15px] text-on-surface-variant select-none"
  }, "zoom_in"), /*#__PURE__*/React.createElement("input", {
    type: "range",
    min: "0.5",
    max: "1.5",
    step: "0.05",
    value: zoom,
    onChange: e => setZoom(parseFloat(e.target.value)),
    className: "w-20 h-1 bg-surface-container rounded-full appearance-none cursor-pointer accent-tertiary"
  }), /*#__PURE__*/React.createElement("span", {
    className: "text-[9px] font-mono font-bold text-on-surface-variant w-8 text-right"
  }, Math.round(zoom * 100), "%")), /*#__PURE__*/React.createElement("button", {
    onClick: () => setTheme(theme === "dark" ? "light" : "dark"),
    className: "w-10 h-10 rounded-lg flex items-center justify-center extruded-raised hover-lift bg-surface-container-high text-tertiary"
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined"
  }, isLightTheme ? "dark_mode" : "light_mode")), /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2 px-3 py-1 bg-surface-container rounded-full border border-tertiary/20 shadow-sm"
  }, /*#__PURE__*/React.createElement("span", {
    className: "w-2 h-2 rounded-full bg-emerald-400 animate-pulse glow-teal"
  }), /*#__PURE__*/React.createElement("span", {
    className: "font-label-mono text-label-mono text-emerald-400 font-bold"
  }, "ORCHESTRATION SYNCED")))), /*#__PURE__*/React.createElement("div", {
    className: "p-margin-desktop space-y-8 flex-1 max-w-[1600px]"
  }, activeAlarm && /*#__PURE__*/React.createElement("div", {
    className: "extruded-raised border-red-500/30 bg-red-950/10 p-5 rounded-xl flex justify-between items-start gap-4 animate-pulse"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-start gap-3"
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined text-red-400 text-3xl"
  }, "error"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("strong", {
    className: "text-red-400 text-xs tracking-wider uppercase font-bold"
  }, "CRITICAL SYSTEM ALERT"), /*#__PURE__*/React.createElement("p", {
    className: "text-[11px] text-on-surface-variant mt-1 leading-normal font-mono"
  }, "Exception trigger on ", /*#__PURE__*/React.createElement("strong", null, activeAlarm.node.replace("spark-", "")), ": ", /*#__PURE__*/React.createElement("br", null), /*#__PURE__*/React.createElement("span", {
    className: "text-on-surface font-mono mt-1 block bg-black/30 p-2 rounded border border-white/5"
  }, activeAlarm.text)))), /*#__PURE__*/React.createElement("button", {
    onClick: () => dismissAlarm(activeAlarm.logText),
    className: "bg-surface-container-high hover:bg-surface-container-highest text-on-surface-variant border border-outline-variant/30 text-[10px] tracking-wider uppercase font-bold px-3 py-1.5 rounded-lg active:scale-95 transition-all shadow-[2px_2px_4px_var(--shadow-dark)]"
  }, "Dismiss")), activeTab === "overview" && /*#__PURE__*/React.createElement("div", {
    className: "space-y-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "glass-panel p-6 rounded-xl flex flex-col md:flex-row justify-between items-start md:items-center gap-4 relative overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute top-0 left-0 w-2 h-full bg-gradient-to-b from-tertiary to-secondary"
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex-1 space-y-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-mono text-[9px] uppercase tracking-widest text-tertiary font-bold"
  }, "Active Crew Directive"), isEditingDirective ? /*#__PURE__*/React.createElement("textarea", {
    value: directiveInput,
    onChange: e => setDirectiveInput(e.target.value),
    className: "w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-on-surface font-mono focus:outline-none focus:ring-1 focus:ring-tertiary",
    rows: "2"
  }) : /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-semibold text-zinc-100 tracking-wide font-sans"
  }, directive || "No directive active.")), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2 self-end md:self-auto"
  }, isEditingDirective ? /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("button", {
    onClick: () => setIsEditingDirective(false),
    className: "px-3.5 py-1.5 bg-surface-container-high text-on-surface-variant hover:text-on-surface border border-white/5 rounded-lg text-xs font-bold font-mono active:scale-95 transition-all"
  }, "CANCEL"), /*#__PURE__*/React.createElement("button", {
    onClick: saveDirective,
    className: "px-3.5 py-1.5 bg-tertiary text-black hover:opacity-90 rounded-lg text-xs font-black font-mono active:scale-95 transition-all"
  }, "SAVE DIRECTIVE")) : /*#__PURE__*/React.createElement("button", {
    onClick: () => setIsEditingDirective(true),
    className: "px-3.5 py-1.5 bg-surface-container-high border border-white/5 text-tertiary hover:scale-105 rounded-lg text-xs font-bold font-mono active:scale-95 transition-all flex items-center gap-1.5"
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined text-[14px]"
  }, "edit"), /*#__PURE__*/React.createElement("span", null, "EDIT DIRECTIVE")))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-4 gap-gutter"
  }, /*#__PURE__*/React.createElement("div", {
    className: "extruded-raised bg-surface rounded-xl p-container-padding flex flex-col gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-label-mono text-label-mono text-on-surface-variant uppercase tracking-widest"
  }, "Active Core Nodes"), /*#__PURE__*/React.createElement("div", {
    className: "flex items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-headline-lg text-headline-lg text-tertiary glow-teal"
  }, onlineNodes), /*#__PURE__*/React.createElement("span", {
    className: "font-label-mono text-label-mono text-tertiary/60"
  }, "/ ", nodeIds.length)), /*#__PURE__*/React.createElement("div", {
    className: "w-full h-1 bg-surface-container-highest rounded-full mt-2 overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "h-full bg-tertiary glow-teal",
    style: {
      width: `${onlineNodes / nodeIds.length * 100}%`
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "extruded-raised bg-surface rounded-xl p-container-padding flex flex-col gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-label-mono text-label-mono text-on-surface-variant uppercase tracking-widest"
  }, "Active Agent Sessions"), /*#__PURE__*/React.createElement("div", {
    className: "flex items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-headline-lg text-headline-lg text-secondary glow-orange"
  }, sessions.length), /*#__PURE__*/React.createElement("span", {
    className: "font-label-mono text-label-mono text-on-surface-variant"
  }, "sessions")), /*#__PURE__*/React.createElement("div", {
    className: "w-full h-1 bg-surface-container-highest rounded-full mt-2 overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "h-full bg-secondary glow-orange",
    style: {
      width: sessions.length > 0 ? '80%' : '0%'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "extruded-raised bg-surface rounded-xl p-container-padding flex flex-col gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-label-mono text-label-mono text-on-surface-variant uppercase tracking-widest"
  }, "Total Agent Answers"), /*#__PURE__*/React.createElement("div", {
    className: "flex items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-headline-lg text-headline-lg text-tertiary"
  }, activity.filter(m => m.role === 'assistant').length + 420), /*#__PURE__*/React.createElement("span", {
    className: "font-label-mono text-label-mono text-on-surface-variant"
  }, "responses")), /*#__PURE__*/React.createElement("div", {
    className: "w-full h-1 bg-surface-container-highest rounded-full mt-2 overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "h-full bg-tertiary",
    style: {
      width: '90%'
    }
  }))), /*#__PURE__*/React.createElement("div", {
    className: "extruded-raised bg-surface rounded-xl p-container-padding flex flex-col gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-label-mono text-label-mono text-on-surface-variant uppercase tracking-widest"
  }, "Kanban Task Backlog"), /*#__PURE__*/React.createElement("div", {
    className: "flex items-baseline gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-headline-lg text-headline-lg text-secondary"
  }, tasks.filter(t => t.status !== 'done').length), /*#__PURE__*/React.createElement("span", {
    className: "font-label-mono text-label-mono text-on-surface-variant"
  }, "open")), /*#__PURE__*/React.createElement("div", {
    className: "w-full h-1 bg-surface-container-highest rounded-full mt-2 overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "h-full bg-secondary",
    style: {
      width: tasks.length > 0 ? `${tasks.filter(t => t.status !== 'done').length / tasks.length * 100}%` : '0%'
    }
  })))), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 lg:grid-cols-3 gap-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "lg:col-span-2 space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-xs font-bold font-mono tracking-widest text-on-surface-variant uppercase flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined text-[16px] text-tertiary"
  }, "monitor_heartbeat"), "Live Collective Operations Feed"), /*#__PURE__*/React.createElement("span", {
    className: "text-[9px] font-mono text-tertiary bg-tertiary/10 border border-tertiary/20 px-2 py-0.5 rounded uppercase"
  }, "Realtime Stream")), /*#__PURE__*/React.createElement("div", {
    className: "glass-panel rounded-xl h-[460px] flex flex-col overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex-grow p-4 overflow-y-auto space-y-4 custom-scrollbar bg-black/25"
  }, activity.length > 0 ? activity.slice(0, 30).map(msg => {
    const isUser = msg.role === "user";
    let senderColor = isUser ? "text-cyan-400 bg-cyan-950/20 border-cyan-500/20" : "text-purple-400 bg-purple-950/20 border-purple-500/20";
    let senderName = isUser ? "User" : "Agent";

    // Try to match agent name from title
    const titleLower = (msg.session_title || "").toLowerCase();
    for (const ak of agentKeys) {
      if (titleLower.includes(ak)) {
        senderName = agentMetadata[ak].name;
        senderColor = agentMetadata[ak].color;
        break;
      }
    }
    const timeStr = new Date(msg.timestamp * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit'
    });
    return /*#__PURE__*/React.createElement("div", {
      key: msg.id,
      className: "flex flex-col gap-1 text-[11px] border-b border-white/5 pb-2"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-center font-mono"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2"
    }, /*#__PURE__*/React.createElement("span", {
      className: `px-2 py-0.5 rounded border text-[8px] font-bold uppercase tracking-wider ${senderColor}`
    }, senderName), /*#__PURE__*/React.createElement("span", {
      className: "text-zinc-500 text-[9px]",
      title: msg.session_title
    }, "Session ID: ", msg.session_id.substring(0, 8), "...")), /*#__PURE__*/React.createElement("span", {
      className: "text-zinc-500 text-[9px]"
    }, timeStr)), /*#__PURE__*/React.createElement("p", {
      className: "font-mono text-zinc-300 whitespace-pre-wrap pl-1.5 leading-relaxed bg-black/10 p-2 rounded border border-white/5 mt-1"
    }, msg.content || "(System Task Invocation)"));
  }) : /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col items-center justify-center h-full gap-2 text-zinc-500 font-mono text-xs"
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined text-4xl text-zinc-600"
  }, "terminal"), /*#__PURE__*/React.createElement("span", null, "Monitoring state database for agent activity..."), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] opacity-60"
  }, "Messages are written here when agents run on Discord/Telegram."))))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-xs font-bold font-mono tracking-widest text-on-surface-variant uppercase flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined text-[16px] text-secondary"
  }, "forum"), "Active Communication Loops"), /*#__PURE__*/React.createElement("div", {
    className: "extruded-raised bg-surface rounded-xl p-4 h-[460px] overflow-y-auto space-y-3 custom-scrollbar"
  }, sessions.slice(0, 10).map(s => {
    const key = agentKeys.find(ak => (s.system_prompt || "").toLowerCase().includes(ak) || (s.title || "").toLowerCase().includes(ak)) || "orchestrator";
    const meta = agentMetadata[key];
    const startedStr = new Date(s.started_at * 1000).toLocaleDateString() + " " + new Date(s.started_at * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    });
    return /*#__PURE__*/React.createElement("div", {
      key: s.id,
      className: "p-3 bg-surface-container-low hover:bg-surface-container border border-white/5 rounded-lg flex flex-col gap-2 transition-all"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-start"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", {
      className: "text-[11px] font-bold text-on-surface truncate max-w-[150px]"
    }, s.title || `Session ${s.id.substring(0, 8)}`), /*#__PURE__*/React.createElement("span", {
      className: "text-[8px] text-zinc-500 font-mono block mt-0.5"
    }, startedStr)), /*#__PURE__*/React.createElement("span", {
      className: `px-1.5 py-0.5 rounded border text-[7px] font-bold uppercase tracking-wider ${meta.color}`
    }, meta.name)), /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between text-[9px] font-mono text-zinc-400 border-t border-white/5 pt-1.5"
    }, /*#__PURE__*/React.createElement("span", null, "Model: ", /*#__PURE__*/React.createElement("span", {
      className: "text-zinc-200"
    }, s.model.split('/').pop())), /*#__PURE__*/React.createElement("span", null, "Count: ", /*#__PURE__*/React.createElement("span", {
      className: "text-zinc-200"
    }, s.message_count))));
  }), sessions.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col items-center justify-center h-full gap-2 text-zinc-500 font-mono text-xs italic"
  }, "No active agent session records."))))), activeTab === "agents" && /*#__PURE__*/React.createElement("div", {
    className: "space-y-6"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-xs font-bold font-mono tracking-widest text-on-surface-variant uppercase"
  }, "Agent System Core Registry"), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-2 gap-6"
  }, agentKeys.map(k => {
    const stats = agentsStats[k];
    const lastActiveStr = stats.lastActive ? new Date(stats.lastActive * 1000).toLocaleDateString() + " " + new Date(stats.lastActive * 1000).toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit'
    }) : "Never active";
    return /*#__PURE__*/React.createElement("div", {
      key: k,
      className: "glass-panel rounded-xl p-5 flex flex-col justify-between gap-4 border border-white/5 hover-lift"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-start"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: `w-10 h-10 rounded-lg flex items-center justify-center border font-mono font-bold text-sm ${stats.color}`
    }, stats.name.substring(0, 2).toUpperCase()), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", {
      className: "text-sm font-extrabold text-on-surface"
    }, stats.name), /*#__PURE__*/React.createElement("p", {
      className: "text-[10px] text-zinc-400 font-mono uppercase tracking-wider mt-0.5"
    }, stats.role))), /*#__PURE__*/React.createElement("span", {
      className: `px-2 py-0.5 rounded border text-[8px] font-bold uppercase tracking-widest ${stats.color}`
    }, stats.platform)), /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-2 gap-3 bg-black/20 p-3 rounded-lg border border-white/5 text-[10px] font-mono text-zinc-400"
    }, /*#__PURE__*/React.createElement("div", null, "Active Session: ", /*#__PURE__*/React.createElement("span", {
      className: "block font-bold text-zinc-200 truncate mt-0.5",
      title: stats.activeSessionId
    }, stats.activeSessionId)), /*#__PURE__*/React.createElement("div", null, "Active Model: ", /*#__PURE__*/React.createElement("span", {
      className: "block font-bold text-zinc-200 mt-0.5"
    }, stats.model.split('/').pop())), /*#__PURE__*/React.createElement("div", null, "Total Loops Run: ", /*#__PURE__*/React.createElement("span", {
      className: "block font-bold text-zinc-200 mt-0.5"
    }, stats.sessionCount)), /*#__PURE__*/React.createElement("div", null, "Total Responses: ", /*#__PURE__*/React.createElement("span", {
      className: "block font-bold text-zinc-200 mt-0.5"
    }, stats.messageCount))), /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-center text-[9px] font-mono text-zinc-500 pt-1"
    }, /*#__PURE__*/React.createElement("span", null, "LAST ACTIVE STATE: ", /*#__PURE__*/React.createElement("span", {
      className: "text-zinc-300 font-bold"
    }, lastActiveStr)), /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-1.5"
    }, /*#__PURE__*/React.createElement("span", {
      className: `w-1.5 h-1.5 rounded-full ${stats.lastActive ? "bg-emerald-400 animate-pulse" : "bg-zinc-600"}`
    }), /*#__PURE__*/React.createElement("span", {
      className: "uppercase text-[8px] tracking-wider"
    }, stats.lastActive ? "Operational" : "Offline"))));
  }))), activeTab === "tasks" && /*#__PURE__*/React.createElement("div", {
    className: "space-y-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-xs font-bold font-mono tracking-widest text-on-surface-variant uppercase"
  }, "Kanban Operations Board"), /*#__PURE__*/React.createElement("span", {
    className: "text-[9px] font-mono text-zinc-400"
  }, "Total Cards: ", tasks.length)), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-3 gap-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center border-b-2 border-zinc-700 pb-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-label-mono text-xs font-bold uppercase tracking-wider text-zinc-300"
  }, "Pending"), /*#__PURE__*/React.createElement("span", {
    className: "px-2 py-0.5 bg-zinc-800 text-zinc-300 rounded-full text-[9px] font-bold font-mono"
  }, tasks.filter(t => t.status === "todo" || t.status === "pending" || t.status === "blocked").length)), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3 min-h-[500px]"
  }, tasks.filter(t => t.status === "todo" || t.status === "pending" || t.status === "blocked").map(t => /*#__PURE__*/React.createElement("div", {
    key: t.id,
    onClick: () => setSelectedTask(t),
    className: "p-3 bg-surface border border-white/5 rounded-lg hover:border-tertiary/20 cursor-pointer hover:shadow-lg transition-all space-y-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-start"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-mono text-[9px] text-tertiary"
  }, "# ", t.id.substring(0, 8)), t.status === "blocked" && /*#__PURE__*/React.createElement("span", {
    className: "text-[7px] bg-red-950/20 text-red-400 border border-red-500/20 px-1 py-0.5 rounded font-bold uppercase font-mono"
  }, "Blocked")), /*#__PURE__*/React.createElement("h4", {
    className: "text-xs font-bold text-on-surface leading-snug"
  }, t.title), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] text-zinc-400 line-clamp-2"
  }, t.body), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center text-[9px] font-mono text-zinc-500 border-t border-white/5 pt-2 mt-1"
  }, /*#__PURE__*/React.createElement("span", null, "Assignee: ", /*#__PURE__*/React.createElement("span", {
    className: "text-zinc-300"
  }, t.assignee || "Unassigned")), /*#__PURE__*/React.createElement("span", null, "Priority: ", /*#__PURE__*/React.createElement("span", {
    className: t.priority > 0 ? "text-amber-400 font-bold" : "text-zinc-400"
  }, t.priority))))))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center border-b-2 border-tertiary/50 pb-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-label-mono text-xs font-bold uppercase tracking-wider text-tertiary"
  }, "Running"), /*#__PURE__*/React.createElement("span", {
    className: "px-2 py-0.5 bg-tertiary/10 text-tertiary border border-tertiary/20 rounded-full text-[9px] font-bold font-mono animate-pulse"
  }, tasks.filter(t => t.status === "running" || t.status === "in_progress" || t.status === "active").length)), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3 min-h-[500px]"
  }, tasks.filter(t => t.status === "running" || t.status === "in_progress" || t.status === "active").map(t => /*#__PURE__*/React.createElement("div", {
    key: t.id,
    onClick: () => setSelectedTask(t),
    className: "p-3 bg-surface border border-tertiary/20 rounded-lg hover:shadow-lg cursor-pointer transition-all space-y-2 relative overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "absolute top-0 left-0 w-full h-[1.5px] bg-tertiary animate-pulse"
  }), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-start"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-mono text-[9px] text-tertiary"
  }, "# ", t.id.substring(0, 8)), /*#__PURE__*/React.createElement("span", {
    className: "w-1.5 h-1.5 bg-tertiary rounded-full animate-ping glow-teal"
  })), /*#__PURE__*/React.createElement("h4", {
    className: "text-xs font-bold text-on-surface leading-snug"
  }, t.title), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] text-zinc-400 line-clamp-2"
  }, t.body), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center text-[9px] font-mono text-zinc-500 border-t border-white/5 pt-2 mt-1"
  }, /*#__PURE__*/React.createElement("span", null, "Assignee: ", /*#__PURE__*/React.createElement("span", {
    className: "text-zinc-300 font-bold"
  }, t.assignee)), /*#__PURE__*/React.createElement("span", null, "Priority: ", /*#__PURE__*/React.createElement("span", {
    className: "text-amber-400 font-bold"
  }, t.priority))))))), /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center border-b-2 border-emerald-500/50 pb-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-label-mono text-xs font-bold uppercase tracking-wider text-emerald-400"
  }, "Completed"), /*#__PURE__*/React.createElement("span", {
    className: "px-2 py-0.5 bg-emerald-950/20 text-emerald-400 border border-emerald-500/20 rounded-full text-[9px] font-bold font-mono"
  }, tasks.filter(t => t.status === "done" || t.status === "completed").length)), /*#__PURE__*/React.createElement("div", {
    className: "space-y-3 min-h-[500px]"
  }, tasks.filter(t => t.status === "done" || t.status === "completed").map(t => /*#__PURE__*/React.createElement("div", {
    key: t.id,
    onClick: () => setSelectedTask(t),
    className: "p-3 bg-surface border border-white/5 rounded-lg opacity-75 hover:opacity-100 hover:border-emerald-500/20 cursor-pointer transition-all space-y-2"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-start"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-mono text-[9px] text-zinc-500"
  }, "# ", t.id.substring(0, 8)), /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined text-emerald-400 text-xs"
  }, "check_circle")), /*#__PURE__*/React.createElement("h4", {
    className: "text-xs font-bold text-on-surface line-through leading-snug"
  }, t.title), /*#__PURE__*/React.createElement("p", {
    className: "text-[10px] text-zinc-500 line-clamp-2"
  }, t.body), /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center text-[9px] font-mono text-zinc-500 border-t border-white/5 pt-2 mt-1"
  }, /*#__PURE__*/React.createElement("span", null, "Assignee: ", /*#__PURE__*/React.createElement("span", {
    className: "text-zinc-400"
  }, t.assignee)), /*#__PURE__*/React.createElement("span", null, "Time: ", /*#__PURE__*/React.createElement("span", {
    className: "text-zinc-400"
  }, t.completed_at ? new Date(t.completed_at * 1000).toLocaleDateString() : "Done"))))))))), activeTab === "schedule" && /*#__PURE__*/React.createElement("div", {
    className: "space-y-6"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-xs font-bold font-mono tracking-widest text-on-surface-variant uppercase"
  }, "Automations Planner"), /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, cronJobs.map(job => {
    const nextRunStr = job.next_run_at ? new Date(job.next_run_at).toLocaleString() : "N/A";
    const createdStr = job.created_at ? new Date(job.created_at).toLocaleString() : "N/A";
    return /*#__PURE__*/React.createElement("div", {
      key: job.id,
      className: "extruded-raised bg-surface p-5 rounded-xl border border-white/5 space-y-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-col md:flex-row justify-between items-start md:items-center gap-2 border-b border-white/5 pb-3"
    }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", {
      className: "text-sm font-extrabold text-tertiary flex items-center gap-2"
    }, /*#__PURE__*/React.createElement("span", {
      className: "material-symbols-outlined text-[18px]"
    }, "alarm"), job.name), /*#__PURE__*/React.createElement("span", {
      className: "text-[8px] text-zinc-500 font-mono mt-0.5"
    }, "JOB ID: ", job.id)), /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex gap-2"
    }, job.enabled_toolsets && job.enabled_toolsets.map(t => /*#__PURE__*/React.createElement("span", {
      key: t,
      className: "text-[8px] bg-zinc-800 text-zinc-300 px-2 py-0.5 rounded font-mono font-bold uppercase"
    }, t))), /*#__PURE__*/React.createElement("span", {
      className: `px-2.5 py-0.5 rounded border text-[9px] font-bold uppercase font-mono tracking-wider ${job.enabled ? "text-emerald-400 bg-emerald-950/20 border-emerald-500/20" : "text-zinc-500 bg-zinc-800 border-zinc-700"}`
    }, job.enabled ? "Enabled" : "Paused"))), /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-1 md:grid-cols-3 gap-4 text-[10px] font-mono text-zinc-400 bg-black/15 p-3 rounded-lg border border-white/5"
    }, /*#__PURE__*/React.createElement("div", null, "Interval Cadence: ", /*#__PURE__*/React.createElement("span", {
      className: "block font-bold text-zinc-200 mt-1 text-xs"
    }, job.schedule_display || job.schedule?.expr || "Custom")), /*#__PURE__*/React.createElement("div", null, "Next Execution: ", /*#__PURE__*/React.createElement("span", {
      className: "block font-bold text-zinc-200 mt-1 text-xs"
    }, nextRunStr)), /*#__PURE__*/React.createElement("div", null, "Created Timestamp: ", /*#__PURE__*/React.createElement("span", {
      className: "block font-bold text-zinc-200 mt-1 text-xs"
    }, createdStr))), /*#__PURE__*/React.createElement("div", {
      className: "space-y-1.5"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[9px] uppercase font-bold text-zinc-500 font-mono"
    }, "Workflow Prompt Brief"), /*#__PURE__*/React.createElement("p", {
      className: "text-[10px] text-zinc-300 font-mono bg-black/30 p-3 rounded-lg border border-white/5 whitespace-pre-wrap leading-relaxed max-h-[160px] overflow-y-auto custom-scrollbar"
    }, job.prompt)));
  }), cronJobs.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "flex flex-col items-center justify-center p-12 text-zinc-500 font-mono text-xs italic bg-surface-container rounded-xl border border-white/5"
  }, "No registered cron jobs found."))), activeTab === "content" && /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 lg:grid-cols-3 gap-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-xs font-bold font-mono tracking-widest text-on-surface-variant uppercase"
  }, "Vault Files Explorer"), /*#__PURE__*/React.createElement("span", {
    className: "text-[9px] font-mono text-zinc-400"
  }, "Files: ", vaultFiles.length)), /*#__PURE__*/React.createElement("div", {
    className: "extruded-raised bg-surface rounded-xl p-4 flex flex-col gap-4 h-[600px] overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, /*#__PURE__*/React.createElement("select", {
    value: contentFilter,
    onChange: e => setContentFilter(e.target.value),
    className: "bg-surface-container-high border border-white/5 rounded px-2 py-1.5 text-[10px] font-mono text-zinc-300 focus:outline-none flex-grow"
  }, /*#__PURE__*/React.createElement("option", {
    value: "all"
  }, "All Channels"), /*#__PURE__*/React.createElement("option", {
    value: "interactions"
  }, "Interactions"), /*#__PURE__*/React.createElement("option", {
    value: "knowledge"
  }, "Knowledge"), /*#__PURE__*/React.createElement("option", {
    value: "references"
  }, "References"))), /*#__PURE__*/React.createElement("div", {
    className: "recessed-inset bg-surface-container-low rounded-lg px-3 py-1.5 flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined text-[16px] text-zinc-500"
  }, "search"), /*#__PURE__*/React.createElement("input", {
    type: "text",
    value: contentSearch,
    onChange: e => setContentSearch(e.target.value),
    placeholder: "Search document names...",
    className: "bg-transparent border-none text-[10px] font-mono placeholder:text-zinc-600 focus:ring-0 text-zinc-200 flex-grow py-0"
  })), /*#__PURE__*/React.createElement("div", {
    className: "flex-grow overflow-y-auto space-y-2 custom-scrollbar pr-1"
  }, vaultFiles.filter(f => {
    if (contentFilter !== "all" && !f.path.startsWith(contentFilter)) return false;
    if (contentSearch && !f.title.toLowerCase().includes(contentSearch.toLowerCase())) return false;
    return true;
  }).map(f => {
    const isSelected = selectedFile === f.path;
    const fileDate = new Date(f.modified * 1000).toLocaleDateString();
    const kbSize = (f.size / 1024).toFixed(1);
    return /*#__PURE__*/React.createElement("div", {
      key: f.path,
      onClick: () => viewFile(f.path),
      className: `p-3 border rounded-lg cursor-pointer transition-all flex flex-col gap-1 ${isSelected ? "bg-surface-container-high border-tertiary/40 shadow-sm" : "bg-surface-container-low border-white/5 hover:bg-surface-container"}`
    }, /*#__PURE__*/React.createElement("h4", {
      className: "text-[11px] font-bold text-zinc-100 truncate"
    }, f.title), /*#__PURE__*/React.createElement("span", {
      className: "text-[8px] font-mono text-zinc-500 uppercase tracking-wider block truncate"
    }, f.path), /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-center text-[8px] font-mono text-zinc-500 pt-1.5 border-t border-white/5 mt-1.5"
    }, /*#__PURE__*/React.createElement("span", null, "Size: ", /*#__PURE__*/React.createElement("span", {
      className: "text-zinc-400 font-bold"
    }, kbSize, " KB")), /*#__PURE__*/React.createElement("span", null, "Modified: ", /*#__PURE__*/React.createElement("span", {
      className: "text-zinc-400 font-bold"
    }, fileDate))));
  }), vaultFiles.length === 0 && /*#__PURE__*/React.createElement("div", {
    className: "text-center py-12 text-zinc-500 font-mono text-[10px] italic"
  }, "No documents found in vault path.")))), /*#__PURE__*/React.createElement("div", {
    className: "lg:col-span-2 space-y-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-xs font-bold font-mono tracking-widest text-on-surface-variant uppercase"
  }, "Document Preview Console"), selectedFile && /*#__PURE__*/React.createElement("span", {
    className: "text-[9px] font-mono text-tertiary border border-tertiary/20 px-2 py-0.5 rounded bg-tertiary/5"
  }, selectedFile)), /*#__PURE__*/React.createElement("div", {
    className: "glass-panel rounded-xl h-[600px] flex flex-col overflow-hidden"
  }, selectedFile ? /*#__PURE__*/React.createElement("div", {
    className: "flex-grow p-6 overflow-y-auto space-y-4 custom-scrollbar bg-black/15"
  }, fileLoading ? /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-center h-full"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-6 h-6 border-2 border-t-tertiary border-r-transparent border-b-tertiary border-l-transparent rounded-full animate-spin"
  })) : /*#__PURE__*/React.createElement("div", {
    className: "prose prose-invert max-w-none text-xs font-sans leading-relaxed text-zinc-300",
    dangerouslySetInnerHTML: {
      __html: renderMarkdown(fileContent)
    }
  })) : /*#__PURE__*/React.createElement("div", {
    className: "flex-grow flex flex-col items-center justify-center gap-3 text-zinc-500 font-mono text-xs"
  }, /*#__PURE__*/React.createElement("span", {
    className: "material-symbols-outlined text-5xl text-zinc-600"
  }, "article"), /*#__PURE__*/React.createElement("span", null, "Select a markdown file to inspect its payload."), /*#__PURE__*/React.createElement("span", {
    className: "text-[10px] opacity-60"
  }, "Synchronized vault notes are displayed here."))))), activeTab === "spark" && /*#__PURE__*/React.createElement("div", {
    className: "space-y-6"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex justify-between items-center bg-surface-container-low p-3 rounded-xl border border-white/5 shadow-[2px_2px_6px_var(--shadow-dark)]"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex gap-2"
  }, ["all-nodes", "gpu", "vllm", "queue", "containers", "psi"].map(st => /*#__PURE__*/React.createElement("button", {
    key: st,
    onClick: () => setSparkSubTab(st),
    className: `px-3 py-1.5 text-[9px] font-bold tracking-wider font-label-mono rounded transition-all active:scale-95 uppercase ${sparkSubTab === st ? 'bg-surface shadow-[2px_2px_4px_var(--shadow-dark),-2px_-2px_4px_var(--shadow-light)] text-tertiary font-black' : 'text-on-surface-variant hover:text-on-surface'}`
  }, st.replace("-", " ")))), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-1"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => setViewMode("table"),
    className: `px-2 py-1 text-[8px] font-bold tracking-wider font-label-mono rounded ${viewMode === "table" ? "bg-surface-container-high text-tertiary" : "text-zinc-500"}`
  }, "TABLE"), /*#__PURE__*/React.createElement("button", {
    onClick: () => setViewMode("grid"),
    className: `px-2 py-1 text-[8px] font-bold tracking-wider font-label-mono rounded ${viewMode === "grid" ? "bg-surface-container-high text-tertiary" : "text-zinc-500"}`
  }, "GRID"))), sparkSubTab === "all-nodes" && /*#__PURE__*/React.createElement("div", {
    className: "space-y-8"
  }, viewMode === "grid" ? /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-2 gap-6"
  }, nodeIds.map(nodeId => {
    const node = metrics.nodes[nodeId];
    const cleanId = nodeId.replace("spark-", "");
    if (!node.online) {
      return /*#__PURE__*/React.createElement("div", {
        key: nodeId,
        className: "extruded-raised flex flex-col justify-center items-center h-[240px] p-6 text-center bg-surface opacity-55"
      }, /*#__PURE__*/React.createElement("span", {
        className: "material-symbols-outlined text-red-400 text-3xl mb-2"
      }, "error"), /*#__PURE__*/React.createElement("h3", {
        className: "text-sm font-bold text-on-surface-variant uppercase tracking-widest"
      }, cleanId), /*#__PURE__*/React.createElement("p", {
        className: "text-[10px] font-mono text-outline-variant mt-1"
      }, "NODE OFFLINE"));
    }
    const ramPerc = node.ram.total ? Math.round(node.ram.used / node.ram.total * 100) : 0;
    const vramPerc = node.gpu && node.gpu.mem_total ? Math.round(node.gpu.mem_used / node.gpu.mem_total * 100) : 0;
    return /*#__PURE__*/React.createElement("div", {
      key: nodeId,
      className: "extruded-raised p-5 flex flex-col justify-between bg-surface relative"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-start mb-4"
    }, /*#__PURE__*/React.createElement("h3", {
      className: "text-sm font-bold text-on-surface tracking-wider uppercase font-label-mono"
    }, cleanId), /*#__PURE__*/React.createElement("span", {
      className: "text-[8px] bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 px-2 py-0.5 rounded-sm font-bold uppercase tracking-wider font-label-mono"
    }, "Online")), /*#__PURE__*/React.createElement("div", {
      className: "flex gap-2 justify-between items-stretch mb-4 bg-surface-container-low p-2 rounded-lg border border-white/5"
    }, CircularGauge({
      value: node.cpu,
      label: 'CPU',
      colorFn: getGoodBadColor,
      isLightTheme
    }), CircularGauge({
      value: ramPerc,
      label: 'RAM',
      colorFn: getGoodBadColor,
      isLightTheme
    }), CircularGauge({
      value: node.disk.perc,
      label: 'DISK',
      colorFn: getGoodBadColor,
      isLightTheme
    }), node.gpu && node.gpu.online && /*#__PURE__*/React.createElement("div", {
      className: "w-[1px] bg-outline-variant/35 self-stretch mx-1.5 my-1"
    }), node.gpu && node.gpu.online && /*#__PURE__*/React.createElement(React.Fragment, null, CircularGauge({
      value: node.gpu.gpu_util,
      label: 'GPU',
      colorFn: getGoodBadColor,
      isLightTheme
    }), CircularGauge({
      value: node.gpu.temp,
      maxVal: 100,
      label: 'TEMP',
      suffix: "\u00b0C",
      colorFn: getGoodBadColor,
      isLightTheme
    }), CircularGauge({
      value: vramPerc,
      label: 'VRAM',
      colorFn: getStrongWeakColor,
      isLightTheme
    }))), /*#__PURE__*/React.createElement("div", {
      className: "border-t border-outline-variant/25 pt-3 text-[10px] font-mono text-on-surface-variant flex flex-col gap-2"
    }, /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-2 gap-x-4 gap-y-1 bg-surface-container-lowest/50 p-2 rounded border border-white/5"
    }, /*#__PURE__*/React.createElement("div", null, "I/O Wait: ", /*#__PURE__*/React.createElement("span", {
      className: "text-on-surface font-bold"
    }, node.iowait || 0, "%")), /*#__PURE__*/React.createElement("div", null, "RAM: ", /*#__PURE__*/React.createElement("span", {
      className: "text-on-surface font-bold"
    }, (node.ram.used / 1024).toFixed(0), "/", (node.ram.total / 1024).toFixed(0), " GB")))));
  })) :
  /*#__PURE__*/
  /* Table view */
  React.createElement("div", {
    className: "extruded-raised bg-surface rounded-xl overflow-hidden border border-white/5"
  }, /*#__PURE__*/React.createElement("table", {
    className: "w-full border-collapse"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    className: "bg-surface-container-low/50 font-label-mono text-label-mono text-on-surface-variant text-left"
  }, /*#__PURE__*/React.createElement("th", {
    className: "p-4 border-b border-outline-variant/25 font-bold uppercase tracking-widest text-[10px]"
  }, "Node Identity"), /*#__PURE__*/React.createElement("th", {
    className: "p-4 border-b border-outline-variant/25 font-bold uppercase tracking-widest text-[10px]"
  }, "System Load"), /*#__PURE__*/React.createElement("th", {
    className: "p-4 border-b border-outline-variant/25 font-bold uppercase tracking-widest text-[10px]"
  }, "GPU Status"), /*#__PURE__*/React.createElement("th", {
    className: "p-4 border-b border-outline-variant/25 font-bold uppercase tracking-widest text-[10px]"
  }, "vLLM Diagnostics"), /*#__PURE__*/React.createElement("th", {
    className: "p-4 border-b border-outline-variant/25 font-bold uppercase tracking-widest text-[10px]"
  }, "Telemetry"))), /*#__PURE__*/React.createElement("tbody", {
    className: "font-label-mono text-label-mono divide-y divide-outline-variant/10"
  }, nodeIds.map(nodeId => {
    const node = metrics.nodes[nodeId];
    const cleanId = nodeId.replace("spark-", "");
    if (!node.online) {
      return /*#__PURE__*/React.createElement("tr", {
        key: nodeId,
        className: "opacity-55 bg-surface-container-lowest/10"
      }, /*#__PURE__*/React.createElement("td", {
        className: "p-4 font-bold text-red-400 flex items-center gap-2"
      }, /*#__PURE__*/React.createElement("span", {
        className: "material-symbols-outlined text-[16px]"
      }, "error"), cleanId), /*#__PURE__*/React.createElement("td", {
        className: "p-4 text-outline-variant italic",
        colSpan: "4"
      }, "OFFLINE"));
    }
    const ramPerc = node.ram.total ? Math.round(node.ram.used / node.ram.total * 100) : 0;
    return /*#__PURE__*/React.createElement("tr", {
      key: nodeId,
      className: "hover:bg-surface-container-low transition-colors group"
    }, /*#__PURE__*/React.createElement("td", {
      className: "p-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-3"
    }, /*#__PURE__*/React.createElement("span", {
      className: "material-symbols-outlined text-tertiary text-lg"
    }, "dns"), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
      className: "text-on-surface font-semibold uppercase"
    }, cleanId), /*#__PURE__*/React.createElement("div", {
      className: "text-[9px] text-zinc-500"
    }, "IP: ", node.ip)))), /*#__PURE__*/React.createElement("td", {
      className: "p-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex gap-4"
    }, HorizontalSteppedGauge({
      value: node.cpu,
      label: 'CPU',
      colorFn: getGoodBadColor,
      isLightTheme
    }), HorizontalSteppedGauge({
      value: ramPerc,
      label: 'RAM',
      colorFn: getGoodBadColor,
      isLightTheme
    }))), /*#__PURE__*/React.createElement("td", {
      className: "p-4"
    }, node.gpu && node.gpu.online ? /*#__PURE__*/React.createElement("div", {
      className: "flex items-center gap-2 text-secondary font-bold text-[10px]"
    }, /*#__PURE__*/React.createElement("span", null, node.gpu.temp, "°C"), /*#__PURE__*/React.createElement("span", null, "/"), /*#__PURE__*/React.createElement("span", null, node.gpu.gpu_util, "% Util")) : /*#__PURE__*/React.createElement("span", {
      className: "text-zinc-600"
    }, "None")), /*#__PURE__*/React.createElement("td", {
      className: "p-4"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[10px] text-zinc-400 font-bold uppercase"
    }, "Online")), /*#__PURE__*/React.createElement("td", {
      className: "p-4 relative"
    }, /*#__PURE__*/React.createElement("div", {
      className: "w-24 spark-line opacity-50 group-hover:opacity-100"
    })));
  }))))), sparkSubTab === "gpu" && /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-1 md:grid-cols-2 gap-6"
  }, nodeIds.map(nodeId => {
    const node = metrics.nodes[nodeId];
    if (!node.online || !node.gpu || !node.gpu.online) return null;
    const cleanId = nodeId.replace("spark-", "");
    const vramPerc = Math.round(node.gpu.mem_used / node.gpu.mem_total * 100);
    return /*#__PURE__*/React.createElement("div", {
      key: nodeId,
      className: "extruded-raised bg-surface p-5 rounded-xl space-y-4"
    }, /*#__PURE__*/React.createElement("h4", {
      className: "text-xs font-bold font-mono text-tertiary border-b border-white/5 pb-2 uppercase"
    }, "Node ", cleanId, " GPU Engine"), /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-2 gap-4"
    }, /*#__PURE__*/React.createElement("div", {
      className: "bg-surface-container-low p-3 rounded-lg border border-white/5 space-y-1"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[9px] uppercase font-bold text-zinc-500"
    }, "GPU Temp"), /*#__PURE__*/React.createElement("span", {
      className: "block text-lg font-mono font-bold text-on-surface"
    }, node.gpu.temp, "°C")), /*#__PURE__*/React.createElement("div", {
      className: "bg-surface-container-low p-3 rounded-lg border border-white/5 space-y-1"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[9px] uppercase font-bold text-zinc-500"
    }, "Utilization"), /*#__PURE__*/React.createElement("span", {
      className: "block text-lg font-mono font-bold text-secondary"
    }, node.gpu.gpu_util, "%"))), /*#__PURE__*/React.createElement("div", {
      className: "space-y-2"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between text-[10px] text-on-surface-variant font-mono"
    }, /*#__PURE__*/React.createElement("span", null, "VRAM Allocation"), /*#__PURE__*/React.createElement("span", {
      className: "font-bold text-on-surface"
    }, (node.gpu.mem_used / 1024).toFixed(1), " / ", (node.gpu.mem_total / 1024).toFixed(1), " GB")), /*#__PURE__*/React.createElement("div", {
      className: "h-2 recessed-inset bg-surface-container rounded-full overflow-hidden w-full"
    }, /*#__PURE__*/React.createElement("div", {
      className: "h-full bg-secondary rounded-full",
      style: {
        width: `${vramPerc}%`
      }
    }))));
  })), sparkSubTab === "vllm" && /*#__PURE__*/React.createElement("div", {
    className: "space-y-6"
  }, Object.keys(metrics.vllm).map(modelName => {
    const v = metrics.vllm[modelName];
    return /*#__PURE__*/React.createElement("div", {
      key: modelName,
      className: "extruded-raised bg-surface p-5 rounded-xl space-y-3"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between items-center text-[11px] font-bold font-mono border-b border-white/5 pb-2"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex flex-col"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-on-surface uppercase tracking-wider"
    }, modelName), v.node_id && /*#__PURE__*/React.createElement("span", {
      className: "text-[9px] text-zinc-500 uppercase mt-0.5"
    }, "Host: ", v.node_id.replace("spark-", ""))), /*#__PURE__*/React.createElement("span", {
      className: `font-black uppercase ${v.online ? "text-tertiary glow-teal" : "text-red-400"}`
    }, v.online ? "ONLINE" : "OFFLINE")), /*#__PURE__*/React.createElement("div", {
      className: "space-y-2"
    }, /*#__PURE__*/React.createElement("div", {
      className: "flex justify-between text-[10px] text-on-surface-variant font-mono"
    }, /*#__PURE__*/React.createElement("span", null, "KV Cache Allocation"), /*#__PURE__*/React.createElement("span", {
      className: "font-bold text-on-surface"
    }, v.online ? `${v.kv_cache_usage.toFixed(1)}%` : "0%")), /*#__PURE__*/React.createElement("div", {
      className: "h-2 recessed-inset bg-surface-container rounded-full overflow-hidden w-full"
    }, /*#__PURE__*/React.createElement("div", {
      className: "h-full bg-tertiary rounded-full transition-[width] duration-700 ease-out",
      style: {
        width: v.online ? `${v.kv_cache_usage}%` : "0%"
      }
    }))));
  })), sparkSubTab === "queue" && /*#__PURE__*/React.createElement("div", {
    className: "extruded-raised bg-surface rounded-xl overflow-hidden border border-white/5"
  }, /*#__PURE__*/React.createElement("table", {
    className: "w-full border-collapse"
  }, /*#__PURE__*/React.createElement("thead", null, /*#__PURE__*/React.createElement("tr", {
    className: "bg-surface-container-low/50 font-label-mono text-label-mono text-on-surface-variant text-left"
  }, /*#__PURE__*/React.createElement("th", {
    className: "p-4 border-b border-outline-variant/25 font-bold uppercase tracking-widest text-[10px]"
  }, "Model Instance"), /*#__PURE__*/React.createElement("th", {
    className: "p-4 border-b border-outline-variant/25 font-bold uppercase tracking-widest text-[10px]"
  }, "Job Task ID"), /*#__PURE__*/React.createElement("th", {
    className: "p-4 border-b border-outline-variant/25 font-bold uppercase tracking-widest text-[10px]"
  }, "Status"), /*#__PURE__*/React.createElement("th", {
    className: "p-4 border-b border-outline-variant/25 font-bold uppercase tracking-widest text-[10px] text-right"
  }, "Actions"))), /*#__PURE__*/React.createElement("tbody", {
    className: "font-label-mono text-label-mono divide-y divide-outline-variant/10"
  }, metrics.queue?.active && metrics.queue.active.length > 0 ? metrics.queue.active.map(job => /*#__PURE__*/React.createElement("tr", {
    key: job.task_id || job.id,
    className: "hover:bg-surface-container-low transition-colors"
  }, /*#__PURE__*/React.createElement("td", {
    className: "p-4 font-bold text-on-surface"
  }, job.model || "Hermes-3-70B"), /*#__PURE__*/React.createElement("td", {
    className: "p-4 font-mono text-outline"
  }, job.task_id || job.id), /*#__PURE__*/React.createElement("td", {
    className: "p-4"
  }, /*#__PURE__*/React.createElement("span", {
    className: "px-2 py-0.5 bg-tertiary/10 border border-tertiary/20 text-tertiary rounded text-[9px] font-bold uppercase"
  }, job.status)), /*#__PURE__*/React.createElement("td", {
    className: "p-4 text-right"
  }, /*#__PURE__*/React.createElement("button", {
    onClick: () => cancelQueueTask(job.task_id || job.id),
    className: "px-3 py-1 bg-surface-container-high border border-red-500/20 text-red-400 text-[9px] font-bold rounded uppercase active:scale-95 transition-all"
  }, "Cancel")))) : /*#__PURE__*/React.createElement("tr", null, /*#__PURE__*/React.createElement("td", {
    className: "p-8 text-center text-on-surface-variant font-mono italic",
    colSpan: "4"
  }, "No active pipeline tasks in queue."))))), sparkSubTab === "containers" && /*#__PURE__*/React.createElement("div", {
    className: "space-y-6"
  }, nodeIds.map(nodeId => {
    const node = metrics.nodes[nodeId];
    if (!node.online || !node.dockers || node.dockers.length === 0) return null;
    const cleanId = nodeId.replace("spark-", "");
    return /*#__PURE__*/React.createElement("div", {
      key: nodeId,
      className: "space-y-3"
    }, /*#__PURE__*/React.createElement("h4", {
      className: "font-bold text-xs text-tertiary font-mono uppercase"
    }, "Node ", cleanId, " Container Services"), /*#__PURE__*/React.createElement("div", {
      className: "grid grid-cols-1 md:grid-cols-2 gap-4"
    }, node.dockers.map(d => {
      const isRunning = d.state === "running";
      return /*#__PURE__*/React.createElement("div", {
        key: d.name,
        className: "extruded-raised bg-surface p-4 rounded-xl flex flex-col justify-between gap-3"
      }, /*#__PURE__*/React.createElement("div", {
        className: "flex justify-between items-start border-b border-white/5 pb-2"
      }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("div", {
        className: "font-bold text-on-surface text-[11px]"
      }, d.name), /*#__PURE__*/React.createElement("div", {
        className: "text-[9px] text-zinc-500 truncate max-w-[150px]",
        title: d.image
      }, d.image)), /*#__PURE__*/React.createElement("div", {
        className: "flex items-center gap-1.5"
      }, /*#__PURE__*/React.createElement("span", {
        className: `w-1.5 h-1.5 rounded-full ${isRunning ? "bg-emerald-400" : "bg-red-400"}`
      }), /*#__PURE__*/React.createElement("span", {
        className: "font-mono text-outline text-[8px] uppercase"
      }, d.status))), /*#__PURE__*/React.createElement("div", {
        className: "flex gap-2"
      }, /*#__PURE__*/React.createElement("button", {
        onClick: () => setLogModal({
          node_id: nodeId,
          type: "docker",
          name: d.name,
          logs: "Loading logs..."
        }),
        className: "flex-1 py-1 bg-surface-container-high border border-white/5 text-on-surface-variant text-[9px] font-bold rounded uppercase text-center active:scale-95"
      }, "Logs"), /*#__PURE__*/React.createElement("button", {
        onClick: () => sendControlAction('container', nodeId, d.name, 'restart'),
        className: "flex-1 py-1 bg-surface-container-high border border-white/5 text-secondary text-[9px] font-bold rounded uppercase text-center active:scale-95"
      }, "Restart")));
    })));
  })), sparkSubTab === "psi" && /*#__PURE__*/React.createElement("div", {
    className: "space-y-6"
  }, nodeIds.map(nodeId => {
    const node = metrics.nodes[nodeId];
    if (!node.online) return null;
    const cleanId = nodeId.replace("spark-", "");
    const psiSome = node.psi_memory && node.psi_memory.some_avg10 || 0;
    return /*#__PURE__*/React.createElement("div", {
      key: nodeId,
      className: "extruded-raised bg-surface p-5 rounded-xl space-y-3"
    }, /*#__PURE__*/React.createElement("h4", {
      className: "font-bold font-mono text-tertiary block border-b border-white/5 pb-2 uppercase"
    }, "Node ", cleanId, " Memory Pressure"), /*#__PURE__*/React.createElement("div", {
      className: "bg-surface-container-low p-3 rounded-lg border border-white/5 space-y-1"
    }, /*#__PURE__*/React.createElement("span", {
      className: "text-[9px] uppercase font-bold text-zinc-500"
    }, "Memory PSI (Some)"), /*#__PURE__*/React.createElement("span", {
      className: "block text-lg font-mono font-bold text-on-surface"
    }, psiSome, "%")));
  })))), /*#__PURE__*/React.createElement("footer", {
    className: "w-full py-4 px-margin-desktop bg-surface-container-lowest flex justify-between items-center border-t border-white/5 z-40"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-label-mono text-[9px] text-on-surface-variant"
  }, "© 2026 Hermes AgentOS. Orchestrator Sync Mode: Active."), /*#__PURE__*/React.createElement("div", {
    className: "flex gap-4"
  }, /*#__PURE__*/React.createElement("span", {
    className: "font-label-mono text-[9px] text-zinc-500 uppercase"
  }, "Spark Node: spark-8828"), /*#__PURE__*/React.createElement("span", {
    className: "font-label-mono text-[9px] text-zinc-500 uppercase"
  }, "Tailscale VPN Connectivity")))), selectedTask && /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 bg-black/70 backdrop-blur-sm z-[90] flex items-center justify-center p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "glass-panel w-full max-w-[600px] bg-[#0c0c0e] text-zinc-300 shadow-2xl flex flex-col h-[450px] rounded-xl overflow-hidden"
  }, /*#__PURE__*/React.createElement("div", {
    className: "px-5 py-4 border-b border-white/5 flex justify-between items-center bg-[#141416]"
  }, /*#__PURE__*/React.createElement("div", {
    className: "flex items-center gap-2"
  }, /*#__PURE__*/React.createElement("span", {
    className: "w-1.5 h-1.5 bg-tertiary rounded-full animate-ping"
  }), /*#__PURE__*/React.createElement("h3", {
    className: "text-[10px] font-bold tracking-widest text-zinc-200 uppercase font-mono"
  }, "Task details // ", selectedTask.id.substring(0, 8))), /*#__PURE__*/React.createElement("button", {
    onClick: () => setSelectedTask(null),
    className: "px-3 py-1 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded border border-white/5 active:scale-95 transition-all"
  }, "Close")), /*#__PURE__*/React.createElement("div", {
    className: "flex-grow p-5 overflow-y-auto space-y-4 custom-scrollbar bg-[#060608]"
  }, /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", {
    className: "text-[10px] uppercase font-bold text-zinc-500 font-mono"
  }, "Title"), /*#__PURE__*/React.createElement("p", {
    className: "text-sm font-bold text-white mt-1"
  }, selectedTask.title)), /*#__PURE__*/React.createElement("div", null, /*#__PURE__*/React.createElement("h4", {
    className: "text-[10px] uppercase font-bold text-zinc-500 font-mono"
  }, "Description"), /*#__PURE__*/React.createElement("p", {
    className: "text-xs text-zinc-300 mt-1 whitespace-pre-wrap font-sans leading-relaxed"
  }, selectedTask.body)), /*#__PURE__*/React.createElement("div", {
    className: "grid grid-cols-2 gap-4 text-[10px] font-mono text-zinc-500 pt-2 border-t border-white/5"
  }, /*#__PURE__*/React.createElement("div", null, "Assignee: ", /*#__PURE__*/React.createElement("span", {
    className: "text-zinc-200 font-bold block mt-0.5"
  }, selectedTask.assignee || "Unassigned")), /*#__PURE__*/React.createElement("div", null, "Status: ", /*#__PURE__*/React.createElement("span", {
    className: "text-tertiary font-bold block mt-0.5 uppercase"
  }, selectedTask.status)), /*#__PURE__*/React.createElement("div", null, "Created At: ", /*#__PURE__*/React.createElement("span", {
    className: "text-zinc-200 block mt-0.5"
  }, new Date(selectedTask.created_at * 1000).toLocaleString())), /*#__PURE__*/React.createElement("div", null, "Priority: ", /*#__PURE__*/React.createElement("span", {
    className: "text-zinc-200 block mt-0.5"
  }, selectedTask.priority)))))), logModal && /*#__PURE__*/React.createElement("div", {
    className: "fixed inset-0 bg-black/75 backdrop-blur-sm z-[90] flex items-center justify-center p-4"
  }, /*#__PURE__*/React.createElement("div", {
    className: "extruded-raised w-full max-w-[800px] bg-[#0c0c0e] text-zinc-300 shadow-2xl flex flex-col h-[520px] overflow-hidden rounded-xl"
  }, /*#__PURE__*/React.createElement("div", {
    className: "px-5 py-4 border-b border-white/5 flex justify-between items-center bg-[#141416]"
  }, /*#__PURE__*/React.createElement("h3", {
    className: "text-[10px] font-bold tracking-widest text-zinc-200 uppercase font-mono"
  }, "[LOG STREAM] ", logModal.node_id.replace("spark-", ""), " // ", logModal.name), /*#__PURE__*/React.createElement("button", {
    onClick: () => setLogModal(null),
    className: "px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 text-xs font-bold rounded border border-white/5 active:scale-95 transition-all"
  }, "Close")), /*#__PURE__*/React.createElement("div", {
    className: "flex-grow p-4 overflow-y-auto font-mono text-[10px] text-zinc-300 leading-relaxed bg-[#060608] custom-scrollbar select-all"
  }, logModal.logs ? /*#__PURE__*/React.createElement("pre", {
    className: "whitespace-pre-wrap"
  }, logModal.logs) : /*#__PURE__*/React.createElement("div", {
    className: "flex items-center justify-center h-full"
  }, /*#__PURE__*/React.createElement("div", {
    className: "w-5 h-5 border-2 border-t-tertiary border-r-transparent border-b-tertiary border-l-transparent rounded-full animate-spin"
  }))))));
};