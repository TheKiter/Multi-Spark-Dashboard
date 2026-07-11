#!/bin/bash
# start_dashboard.sh

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" &> /dev/null && pwd )"
PIDFILE="$DIR/server.pid"
LOGFILE="$DIR/server.log"

start() {
    if [ -f "$PIDFILE" ]; then
        PID=$(cat "$PIDFILE")
        if ps -p $PID > /dev/null; then
            echo "Telemetry server is already running (PID: $PID)."
            return
        fi
    fi
    echo "Starting Telemetry server..."
    nohup python3 "$DIR/server.py" > "$LOGFILE" 2>&1 &
    echo $! > "$PIDFILE"
    sleep 1
    PID=$(cat "$PIDFILE")
    if ps -p $PID > /dev/null; then
        echo "Telemetry server successfully started (PID: $PID) on port 8050."
    else
        echo "Failed to start Telemetry server. Check logs in $LOGFILE"
    fi
}

stop() {
    if [ -f "$PIDFILE" ]; then
        PID=$(cat "$PIDFILE")
        echo "Stopping Telemetry server (PID: $PID)..."
        kill $PID
        rm -f "$PIDFILE"
        echo "Telemetry server stopped."
    else
        echo "Telemetry server is not running."
    fi
}

status() {
    if [ -f "$PIDFILE" ]; then
        PID=$(cat "$PIDFILE")
        if ps -p $PID > /dev/null; then
            echo "Telemetry server is running (PID: $PID)."
            return 0
        fi
    fi
    echo "Telemetry server is stopped."
    return 1
}

case "$1" in
    start)
        start
        ;;
    stop)
        stop
        ;;
    restart)
        stop
        sleep 1
        start
        ;;
    status)
        status
        ;;
    *)
        echo "Usage: $0 {start|stop|restart|status}"
        exit 1
esac
