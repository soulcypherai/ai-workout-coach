#!/bin/bash

# LiveKit server management script

case "$1" in
  start)
    echo "🚀 Starting LiveKit server..."
    docker-compose up -d
    echo "✅ LiveKit server started on:"
    echo "   WebSocket: ws://localhost:7880"
    echo "   HTTP API: http://localhost:7881"
    echo "   Redis: localhost:6379"
    ;;
  stop)
    echo "🛑 Stopping LiveKit server..."
    docker-compose down
    echo "✅ LiveKit server stopped"
    ;;
  restart)
    echo "🔄 Restarting LiveKit server..."
    docker-compose down
    docker-compose up -d
    echo "✅ LiveKit server restarted"
    ;;
  logs)
    echo "📋 Showing LiveKit logs..."
    docker-compose logs -f livekit
    ;;
  status)
    echo "📊 LiveKit server status:"
    docker-compose ps
    ;;
  *)
    echo "Usage: $0 {start|stop|restart|logs|status}"
    echo ""
    echo "Commands:"
    echo "  start   - Start LiveKit server"
    echo "  stop    - Stop LiveKit server"
    echo "  restart - Restart LiveKit server"
    echo "  logs    - Show server logs"
    echo "  status  - Show server status"
    exit 1
    ;;
esac