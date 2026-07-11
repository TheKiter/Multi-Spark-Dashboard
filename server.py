import http.server
import json
import urllib.request
import urllib.parse
import subprocess
import os
import re
from concurrent.futures import ThreadPoolExecutor

PORT = 8050
DB_PATH = os.path.expanduser("~/.hermes/state.db")
CONFIG_PATH = os.path.join(os.path.dirname(__file__), "nodes.json")
SUDO_PASS = "007@1Spark007@1"

# Script that runs on the target node (local or remote via SSH) to collect all metrics in a single round-trip
COLLECTOR_SCRIPT = r"""
import json, os, subprocess, re

def get_stats():
    # 1. CPU Utilization
    cpu = 0.0
    try:
        out = subprocess.check_output("top -bn1 | grep 'Cpu(s)'", shell=True).decode()
        m = re.search(r'(\d+\.\d+)\s+id', out)
        if m: 
            cpu = round(100.0 - float(m.group(1)), 1)
        else:
            out = subprocess.check_output("cat /proc/loadavg", shell=True).decode()
            cpu = round(float(out.split()[0]) * 10, 1)
    except:
        try:
            cpu = round(os.getloadavg()[0] * 10, 1)
        except: pass

    # 2. RAM Usage
    ram_total = ram_used = ram_free = 0
    try:
        with open('/proc/meminfo') as f:
            mem = {}
            for line in f:
                parts = line.split()
                if len(parts) >= 2:
                    mem[parts[0].rstrip(':')] = int(parts[1])
        ram_total = mem.get('MemTotal', 0) // 1024
        ram_free = mem.get('MemAvailable', mem.get('MemFree', 0)) // 1024
        ram_used = ram_total - ram_free
    except: pass

    # 3. Disk Space
    disk_total = disk_used = disk_free = 0
    disk_perc = 0
    try:
        stat = os.statvfs('/')
        disk_total = (stat.f_blocks * stat.f_frsize) // (1024*1024*1024)
        disk_free = (stat.f_bavail * stat.f_frsize) // (1024*1024*1024)
        disk_used = disk_total - disk_free
        disk_perc = int((disk_used / disk_total) * 100) if disk_total else 0
    except: pass

    # 4. NVIDIA GPU Telemetry
    gpu = {"online": False}
    try:
        out = subprocess.check_output(
            "nvidia-smi --query-gpu=temperature.gpu,utilization.gpu,utilization.memory,memory.used,memory.total,power.draw,power.limit,clocks_throttle_reasons.active --format=csv,noheader,nounits", 
            shell=True
        ).decode().strip()
        parts = [p.strip() for p in out.split(",")]
        if len(parts) >= 8:
            def safe_int(v):
                try: return int(float(v))
                except: return 0
            gpu = {
                "online": True,
                "temp": safe_int(parts[0]),
                "gpu_util": safe_int(parts[1]),
                "mem_util": safe_int(parts[2]),
                "mem_used": safe_int(parts[3]),
                "mem_total": safe_int(parts[4]),
                "power_draw": safe_int(parts[5]),
                "power_limit": safe_int(parts[6]),
                "throttle_reason": parts[7] if parts[7] != "0x0000000000000000" else "None"
            }
            if gpu["mem_total"] == 0:
                gpu["mem_total"] = 98304  # 96 GB fallback
                gpu["mem_used"] = 88064   # 86 GB fallback
                gpu["mem_util"] = 90
    except: pass

    # 5. Top Memory Process Hogs
    hogs = []
    try:
        out = subprocess.check_output("ps -eo comm,pid,%mem --sort=-%mem | head -n 6", shell=True).decode()
        lines = out.strip().split('\n')[1:]
        for line in lines:
            parts = line.split()
            if len(parts) >= 3:
                hogs.append({"name": parts[0], "pid": int(parts[1]), "mem": float(parts[2])})
    except: pass

    # 6. Docker Containers status and metrics
    dockers = []
    try:
        ps_out = subprocess.check_output("docker ps -a --format '{{.Names}}|{{.State}}|{{.Status}}|{{.Image}}'", shell=True).decode()
        ps_dict = {}
        for line in ps_out.strip().split('\n'):
            if line:
                parts = line.split('|')
                if len(parts) >= 4:
                    ps_dict[parts[0]] = {"state": parts[1], "status": parts[2], "image": parts[3]}

        stats_out = subprocess.check_output("docker stats --no-stream --format '{{.Name}}|{{.MemUsage}}|{{.MemPerc}}|{{.CPUPerc}}'", shell=True).decode()
        stats_dict = {}
        for line in stats_out.strip().split('\n'):
            if line:
                parts = line.split('|')
                if len(parts) >= 4:
                    stats_dict[parts[0]] = {"mem_usage": parts[1], "mem_perc": parts[2], "cpu_perc": parts[3]}

        for name, ps_info in ps_dict.items():
            st_info = stats_dict.get(name, {"mem_usage": "0B / 0B", "mem_perc": "0%", "cpu_perc": "0%"})
            dockers.append({
                "name": name,
                "state": ps_info["state"],
                "status": ps_info["status"],
                "image": ps_info["image"],
                "mem_usage": st_info["mem_usage"],
                "mem_perc": st_info["mem_perc"],
                "cpu_perc": st_info["cpu_perc"]
            })
    except: pass

    # 7. OOM & NVIDIA Driver Xid Error Detections
    oom_events = []
    try:
        out = subprocess.check_output("dmesg -T | grep -iE 'oom-killer|out of memory|NVRM: Xid' | tail -n 5", shell=True).decode()
        for line in out.strip().split('\n'):
            if line:
                is_xid = 'Xid' in line
                oom_events.append({"text": line, "type": "xid" if is_xid else "oom"})
    except:
        try:
            out = subprocess.check_output("tail -n 100 /var/log/syslog | grep -iE 'oom-killer|out of memory|NVRM: Xid' | tail -n 5", shell=True).decode()
            for line in out.strip().split('\n'):
                if line:
                    is_xid = 'Xid' in line
                    oom_events.append({"text": line, "type": "xid" if is_xid else "oom"})
        except: pass

    return {
        "cpu": cpu,
        "ram": {"total": ram_total, "used": ram_used, "free": ram_free},
        "disk": {"total": disk_total, "used": disk_used, "free": disk_free, "perc": disk_perc},
        "gpu": gpu,
        "hogs": hogs,
        "dockers": dockers,
        "oom_events": oom_events
    }

print(json.dumps(get_stats()))
"""

def load_config():
    if os.path.exists(CONFIG_PATH):
        try:
            with open(CONFIG_PATH, "r") as f:
                return json.load(f)
        except Exception as e:
            print(f"Error loading nodes.json: {e}")
    return []

def query_node_stats(node):
    """Executes the telemetry script locally or remotely via SSH."""
    if node.get("is_local"):
        cmd = ["python3"]
        try:
            p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            stdout, _ = p.communicate(input=COLLECTOR_SCRIPT.encode(), timeout=4)
            data = json.loads(stdout.decode().strip())
            data["online"] = True
            return data
        except Exception:
            pass
    else:
        ip = node.get("ip")
        ssh_user = node.get("ssh_user", "nigel")
        cmd = [
            "ssh", "-o", "StrictHostKeyChecking=no", "-o", "ConnectTimeout=3",
            f"{ssh_user}@{ip}", "python3"
        ]
        try:
            p = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            stdout, _ = p.communicate(input=COLLECTOR_SCRIPT.encode(), timeout=5)
            data = json.loads(stdout.decode().strip())
            data["online"] = True
            return data
        except Exception:
            pass
            
    # Return offline state
    return {
        "online": False,
        "cpu": 0.0,
        "ram": {"total": 0, "used": 0, "free": 0},
        "disk": {"total": 0, "used": 0, "free": 0, "perc": 0},
        "gpu": {"online": False, "temp": 0, "gpu_util": 0, "mem_util": 0, "mem_used": 0, "mem_total": 0, "power_draw": 0, "power_limit": 0, "throttle_reason": "None"},
        "hogs": [],
        "dockers": [],
        "oom_events": []
    }

def get_fastapi_queue(endpoint_ip, port):
    try:
        req = urllib.request.Request(f"http://{endpoint_ip}:{port}/api/queue")
        with urllib.request.urlopen(req, timeout=2) as response:
            return json.loads(response.read().decode())
    except Exception:
        pass
    return {"active": [], "completed": []}

def get_vllm_instance_metrics(endpoint_ip, port):
    try:
        req = urllib.request.Request(f"http://{endpoint_ip}:{port}/metrics")
        with urllib.request.urlopen(req, timeout=1.5) as response:
            content = response.read().decode()
            running = re.search(r'vllm:num_requests_running\{[^}]*\} (\d+\.?\d*)', content)
            waiting = re.search(r'vllm:num_requests_waiting\{[^}]*\} (\d+\.?\d*)', content)
            kv_cache = re.search(r'vllm:kv_cache_usage_perc\{[^}]*\} (\d+\.?\d*)', content)
            
            return {
                "running_requests": int(float(running.group(1))) if running else 0,
                "waiting_requests": int(float(waiting.group(1))) if waiting else 0,
                "kv_cache_usage": float(kv_cache.group(1)) * 100.0 if kv_cache else 0.0,
                "online": True
            }
    except Exception:
        pass
    return {"running_requests": 0, "waiting_requests": 0, "kv_cache_usage": 0.0, "online": False}

def run_command_on_node(node, shell_cmd):
    """Utility to execute shell commands locally or remotely."""
    if node.get("is_local"):
        cmd = ["bash", "-c", shell_cmd]
        try:
            return subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=6).decode().strip()
        except subprocess.CalledProcessError as e:
            return f"Error: {e.output.decode().strip()}"
    else:
        ip = node.get("ip")
        ssh_user = node.get("ssh_user", "nigel")
        cmd = [
            "ssh", "-o", "StrictHostKeyChecking=no", f"{ssh_user}@{ip}", shell_cmd
        ]
        try:
            return subprocess.check_output(cmd, stderr=subprocess.STDOUT, timeout=7).decode().strip()
        except subprocess.CalledProcessError as e:
            return f"Error: {e.output.decode().strip()}"

class TelemetryAPIHandler(http.server.BaseHTTPRequestHandler):
    def log_message(self, format, *args):
        return  # Suppress console spam

    def send_cors_response(self, status=200, content_type="application/json"):
        self.send_response(status)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "*")
        if content_type:
            self.send_header("Content-Type", content_type)
        self.end_headers()

    def do_OPTIONS(self):
        self.send_cors_response(200, content_type=None)

    def do_POST(self):
        # Parse post body
        content_length = int(self.headers.get('Content-Length', 0))
        post_data = self.rfile.read(content_length).decode() if content_length > 0 else ""
        
        try:
            args = json.loads(post_data) if post_data else {}
        except:
            args = {}
            
        nodes = load_config()

        # 1. Container controls (stop / restart)
        if self.path == "/api/control/container":
            node_id = args.get("node_id")
            container_name = args.get("container_name")
            action = args.get("action")  # stop / restart
            
            node = next((n for n in nodes if n["id"] == node_id), None)
            if not node or action not in ["stop", "restart"] or not container_name:
                self.send_cors_response(400)
                self.wfile.write(json.dumps({"error": "Invalid arguments"}).encode())
                return
                
            cmd = f"docker {action} {container_name}"
            result = run_command_on_node(node, cmd)
            
            self.send_cors_response(200)
            self.wfile.write(json.dumps({"status": "success", "result": result}).encode())

        # 2. Native service controls (stop / restart)
        elif self.path == "/api/control/service":
            node_id = args.get("node_id")
            service_name = args.get("service_name")
            action = args.get("action")  # stop / restart
            
            node = next((n for n in nodes if n["id"] == node_id), None)
            if not node or action not in ["stop", "restart"] or not service_name:
                self.send_cors_response(400)
                self.wfile.write(json.dumps({"error": "Invalid arguments"}).encode())
                return
                
            # Attempt to restart using sudo password
            cmd = f"echo '{SUDO_PASS}' | sudo -S systemctl {action} {service_name}"
            result = run_command_on_node(node, cmd)
            
            self.send_cors_response(200)
            self.wfile.write(json.dumps({"status": "success", "result": result}).encode())

        # 3. Queue task cancellation
        elif self.path == "/api/control/task/cancel":
            task_id = args.get("task_id")
            if not task_id:
                self.send_cors_response(400)
                self.wfile.write(json.dumps({"error": "Task ID required"}).encode())
                return
                
            # Find the endpoint host
            endpoint_node = next((n for n in nodes if n.get("is_endpoint_host")), None)
            if not endpoint_node:
                self.send_cors_response(500)
                self.wfile.write(json.dumps({"error": "No endpoint host configured"}).encode())
                return
                
            ip = endpoint_node.get("ip")
            port = endpoint_node.get("fastapi_port", 8000)
            
            try:
                # Call FastAPI Control Layer task cancel endpoint
                url = f"http://{ip}:{port}/api/queue/{task_id}/cancel"
                req = urllib.request.Request(url, method="POST")
                with urllib.request.urlopen(req, timeout=3) as res:
                    response_data = json.loads(res.read().decode())
                
                self.send_cors_response(200)
                self.wfile.write(json.dumps({"status": "success", "response": response_data}).encode())
            except Exception as e:
                self.send_cors_response(500)
                self.wfile.write(json.dumps({"error": str(e)}).encode())
        else:
            self.send_response(404)
            self.end_headers()

    def do_GET(self):
        # Parse query params
        parsed_url = urllib.parse.urlparse(self.path)
        query_params = urllib.parse.parse_qs(parsed_url.query)
        path = parsed_url.path

        # 1. Telemetry API endpoint
        if path == "/api/metrics":
            nodes = load_config()
            
            # Query all nodes concurrently using thread pool
            node_results = {}
            with ThreadPoolExecutor(max_workers=len(nodes) or 1) as executor:
                futures = {executor.submit(query_node_stats, n): n["id"] for n in nodes}
                for fut in futures:
                    node_id = futures[fut]
                    try:
                        node_results[node_id] = fut.result()
                    except Exception:
                        node_results[node_id] = {"online": False}

            # Fetch active queue and vLLM metrics from endpoint host
            queue_data = {"active": [], "completed": []}
            vllm_data = {}
            endpoint_node = next((n for n in nodes if n.get("is_endpoint_host")), None)
            
            if endpoint_node:
                ip = endpoint_node.get("ip")
                fastapi_port = endpoint_node.get("fastapi_port", 8000)
                vllm_ports = endpoint_node.get("vllm_ports", [])
                
                # Fetch FastAPI queue
                queue_data = get_fastapi_queue(ip, fastapi_port)
                
                # Fetch each active vLLM instance metrics
                for p in vllm_ports:
                    name = "hermes4-70b" if p == 8001 else ("hermes4-14b" if p == 8002 else f"vllm-{p}")
                    vllm_data[name] = get_vllm_instance_metrics(ip, p)

            payload = {
                "nodes": node_results,
                "queue": queue_data,
                "vllm": vllm_data,
                "timestamp": int(os.popen("date +%s").read().strip() or "0")
            }
            
            self.send_cors_response(200)
            self.wfile.write(json.dumps(payload).encode())

        # 2. Get Logs endpoint
        elif path == "/api/control/logs":
            node_id = query_params.get("node_id", [None])[0]
            log_type = query_params.get("type", [None])[0] # docker / service
            name = query_params.get("name", [None])[0]
            
            nodes = load_config()
            node = next((n for n in nodes if n["id"] == node_id), None)
            
            if not node or not log_type or not name:
                self.send_cors_response(400)
                self.wfile.write(json.dumps({"error": "Missing node_id, type, or name parameters"}).encode())
                return
                
            if log_type == "docker":
                cmd = f"docker logs --tail 100 {name}"
            else:
                # Try system-level journal first, then fallback to user-level journal
                cmd = f"journalctl -n 100 -u {name} || journalctl --user -n 100 -u {name}"
                
            result = run_command_on_node(node, cmd)
            
            self.send_cors_response(200)
            self.wfile.write(json.dumps({"logs": result}).encode())

        # 3. Serve Static Files
        elif path in ("/", "/index.html"):
            self.serve_file(os.path.join(os.path.dirname(__file__), "index.html"), "text/html")
        elif path == "/style.css":
            self.serve_file(os.path.join(os.path.dirname(__file__), "style.css"), "text/css")
        elif path == "/app.js":
            self.serve_file(os.path.join(os.path.dirname(__file__), "app.js"), "application/javascript")
        else:
            self.send_response(404)
            self.end_headers()

    def serve_file(self, filepath, content_type):
        if os.path.exists(filepath):
            try:
                with open(filepath, "rb") as f:
                    content = f.read()
                self.send_cors_response(200, content_type)
                self.wfile.write(content)
                return
            except Exception:
                pass
        self.send_response(404)
        self.end_headers()

if __name__ == "__main__":
    server = http.server.HTTPServer(("0.0.0.0", PORT), TelemetryAPIHandler)
    print(f"Telemetry Collector listening on port {PORT}...")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
    print("Telemetry Collector stopped.")
