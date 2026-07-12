import subprocess
import time
import urllib.request
import json
import socket
import os

chrome_path = r"C:\Program Files\Google\Chrome\Application\chrome.exe"
if not os.path.exists(chrome_path):
    chrome_path = r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"

print(f"Launching Chrome from: {chrome_path}")

# Start Chrome in headless mode with remote debugging (no URL initially)
proc = subprocess.Popen([
    chrome_path,
    "--headless",
    "--remote-debugging-port=9222",
    "--disable-gpu",
    "--no-sandbox"
])

time.sleep(2) # Wait for Chrome to boot

try:
    # Query the DevTools active targets
    req = urllib.request.urlopen("http://127.0.0.1:9222/json")
    targets = json.loads(req.read().decode('utf-8'))
    
    # We want to find the tab target
    tab_target = None
    for t in targets:
        if t.get('type') == 'page':
            tab_target = t
            break
            
    if not tab_target:
        print("Could not find active page target in Chrome debugger!")
        print("Targets:", targets)
    else:
        ws_url = tab_target.get('webSocketDebuggerUrl')
        print(f"Connecting to tab debugger: {ws_url}")
        
        from urllib.parse import urlparse
        u = urlparse(ws_url)
        path = u.path
        
        # Construct handshake
        ws_handshake = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: 127.0.0.1:9222\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==\r\n"
            f"Sec-WebSocket-Version: 13\r\n\r\n"
        )
        
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(8)
        s.connect(('127.0.0.1', 9222))
        s.sendall(ws_handshake.encode('utf-8'))
        
        # Read handshake response
        resp = s.recv(4096)
        if b"101" in resp:
            print("WebSocket handshake successful!")
            
            # Helper to frame a WebSocket text message
            def frame_message(text):
                payload = text.encode('utf-8')
                length = len(payload)
                frame = bytearray([0x81]) # Fin + Text frame
                if length <= 125:
                    frame.append(length)
                elif length <= 65535:
                    frame.append(126)
                    frame.extend(length.to_bytes(2, 'big'))
                else:
                    frame.append(127)
                    frame.extend(length.to_bytes(8, 'big'))
                frame.extend(payload)
                return frame
            
            # Helper to unframe a WebSocket text message
            def unframe_message(data):
                if len(data) < 2: return None, b''
                second_byte = data[1]
                payload_len = second_byte & 127
                mask_offset = 2
                if payload_len == 126:
                    payload_len = int.from_bytes(data[2:4], 'big')
                    mask_offset = 4
                elif payload_len == 127:
                    payload_len = int.from_bytes(data[2:10], 'big')
                    mask_offset = 10
                
                is_masked = (second_byte & 128) != 0
                if is_masked:
                    mask = data[mask_offset:mask_offset+4]
                    payload_offset = mask_offset + 4
                else:
                    payload_offset = mask_offset
                
                payload = data[payload_offset:payload_offset+payload_len]
                leftover = data[payload_offset+payload_len:]
                
                if is_masked:
                    unmasked = bytearray(payload_len)
                    for i in range(payload_len):
                        unmasked[i] = payload[i] ^ mask[i % 4]
                    return unmasked.decode('utf-8', errors='ignore'), leftover
                return payload.decode('utf-8', errors='ignore'), leftover

            # Enable Console, Log, and Page domains
            s.sendall(frame_message(json.dumps({"id": 1, "method": "Runtime.enable"})))
            s.sendall(frame_message(json.dumps({"id": 2, "method": "Log.enable"})))
            s.sendall(frame_message(json.dumps({"id": 3, "method": "Page.enable"})))
            
            # Navigate to the target page
            s.sendall(frame_message(json.dumps({
                "id": 4, 
                "method": "Page.navigate", 
                "params": {"url": "http://100.120.5.111:8050/"}
            })))
            
            # Wait and read console messages
            print("\n--- Listening for browser console logs (5 seconds) ---")
            start_time = time.time()
            buffer = b''
            while time.time() - start_time < 5:
                try:
                    chunk = s.recv(4096)
                    if not chunk: break
                    buffer += chunk
                    
                    while len(buffer) >= 2:
                        msg, buffer = unframe_message(buffer)
                        if msg:
                            # Parse JSON-RPC notification
                            try:
                                event = json.loads(msg)
                                if event.get('method') == 'Runtime.consoleAPICalled':
                                    args = event['params']['args']
                                    text_args = [a.get('value', a.get('description', '')) for a in args]
                                    print(f"[CONSOLE {event['params']['type'].upper()}]:", " ".join(map(str, text_args)))
                                elif event.get('method') == 'Runtime.exceptionThrown':
                                    details = event['params']['exceptionDetails']
                                    desc = details.get('exception', {}).get('description', 'Unknown Error')
                                    print(f"[EXCEPTION]: {desc} at line {details.get('lineNumber')}:{details.get('columnNumber')}")
                                elif event.get('method') == 'Log.entryAdded':
                                    entry = event['params']['entry']
                                    print(f"[LOG {entry.get('level').upper()}]: {entry.get('text')} ({entry.get('url')})")
                            except Exception as e:
                                pass
                except socket.timeout:
                    pass
        else:
            print("WebSocket handshake failed:", resp)
        s.close()
        
except Exception as e:
    print("Failed to query debugger:", e)
finally:
    proc.terminate()
    print("\nHeadless Chrome stopped.")
