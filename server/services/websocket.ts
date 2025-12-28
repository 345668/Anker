import { WebSocketServer, WebSocket } from "ws";
import type { Server as HTTPServer } from "http";
import type { IncomingMessage } from "http";
import type { Notification } from "@shared/schema";

interface AuthenticatedWebSocket extends WebSocket {
  userId?: string;
  isAlive?: boolean;
}

interface WebSocketMessage {
  type: "notification" | "deal_update" | "message_received" | "ping" | "pong" | "auth";
  payload?: any;
}

type SessionParser = (req: IncomingMessage) => Promise<string | null>;

class NotificationWebSocketService {
  private wss: WebSocketServer | null = null;
  private clients: Map<string, Set<AuthenticatedWebSocket>> = new Map();
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private sessionParser: SessionParser | null = null;
  private pendingAuthSockets: Map<WebSocket, NodeJS.Timeout> = new Map();

  initialize(server: HTTPServer, sessionParser?: SessionParser) {
    this.sessionParser = sessionParser || null;
    
    this.wss = new WebSocketServer({ 
      server,
      path: "/ws/notifications"
    });

    this.wss.on("connection", async (ws: AuthenticatedWebSocket, req) => {
      console.log("[WebSocket] New connection attempt");
      
      ws.isAlive = true;
      
      if (this.sessionParser) {
        try {
          const userId = await this.sessionParser(req);
          if (userId) {
            this.registerClient(userId, ws);
          } else {
            console.log("[WebSocket] Connection without valid session, waiting for auth message");
            const timeout = setTimeout(() => {
              if (!ws.userId) {
                console.log("[WebSocket] Auth timeout, closing connection");
                ws.close(4001, "Authentication required");
              }
              this.pendingAuthSockets.delete(ws);
            }, 10000);
            this.pendingAuthSockets.set(ws, timeout);
          }
        } catch (error) {
          console.error("[WebSocket] Session parse error:", error);
        }
      }
      
      ws.on("pong", () => {
        ws.isAlive = true;
      });

      ws.on("message", (data) => {
        try {
          const message: WebSocketMessage = JSON.parse(data.toString());
          this.handleMessage(ws, message);
        } catch (error) {
          console.error("[WebSocket] Error parsing message:", error);
        }
      });

      ws.on("close", () => {
        this.removeClient(ws);
        const timeout = this.pendingAuthSockets.get(ws);
        if (timeout) {
          clearTimeout(timeout);
          this.pendingAuthSockets.delete(ws);
        }
        console.log("[WebSocket] Client disconnected");
      });

      ws.on("error", (error) => {
        console.error("[WebSocket] Error:", error);
        this.removeClient(ws);
      });
    });

    this.startHeartbeat();
    console.log("[WebSocket] Notification service initialized on /ws/notifications");
  }

  private handleMessage(ws: AuthenticatedWebSocket, message: WebSocketMessage) {
    switch (message.type) {
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        break;
      case "auth":
        if (ws.userId) {
          ws.send(JSON.stringify({ 
            type: "notification",
            payload: { status: "already_authenticated", userId: ws.userId }
          }));
        }
        break;
      default:
        break;
    }
  }

  registerClient(userId: string, ws: AuthenticatedWebSocket) {
    if (ws.userId) return;
    
    ws.userId = userId;
    
    if (!this.clients.has(userId)) {
      this.clients.set(userId, new Set());
    }
    this.clients.get(userId)!.add(ws);
    
    const timeout = this.pendingAuthSockets.get(ws);
    if (timeout) {
      clearTimeout(timeout);
      this.pendingAuthSockets.delete(ws);
    }
    
    console.log(`[WebSocket] Client authenticated for user: ${userId}`);
    
    ws.send(JSON.stringify({ 
      type: "notification",
      payload: { 
        status: "connected",
        message: "Successfully connected to notification service"
      }
    }));
  }

  private removeClient(ws: AuthenticatedWebSocket) {
    if (ws.userId && this.clients.has(ws.userId)) {
      this.clients.get(ws.userId)!.delete(ws);
      if (this.clients.get(ws.userId)!.size === 0) {
        this.clients.delete(ws.userId);
      }
    }
  }

  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      this.wss?.clients.forEach((ws) => {
        const authWs = ws as AuthenticatedWebSocket;
        if (authWs.isAlive === false) {
          this.removeClient(authWs);
          return authWs.terminate();
        }
        authWs.isAlive = false;
        authWs.ping();
      });
    }, 30000);
  }

  sendNotification(userId: string, notification: Notification) {
    const userClients = this.clients.get(userId);
    if (!userClients || userClients.size === 0) {
      console.log(`[WebSocket] No active connections for user: ${userId}`);
      return;
    }

    const message = JSON.stringify({
      type: "notification",
      payload: notification
    });

    userClients.forEach((ws) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(message);
        console.log(`[WebSocket] Sent notification to user: ${userId}`);
      }
    });
  }

  broadcastDealUpdate(userIds: string[], dealId: string, update: any) {
    const message = JSON.stringify({
      type: "deal_update",
      payload: { dealId, ...update }
    });

    userIds.forEach((userId) => {
      const userClients = this.clients.get(userId);
      if (userClients) {
        userClients.forEach((ws) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(message);
          }
        });
      }
    });
  }

  getConnectedUsers(): string[] {
    return Array.from(this.clients.keys());
  }

  getConnectionCount(): number {
    let count = 0;
    this.clients.forEach((clients) => {
      count += clients.size;
    });
    return count;
  }

  shutdown() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
    }
    this.pendingAuthSockets.forEach((timeout) => clearTimeout(timeout));
    this.pendingAuthSockets.clear();
    this.wss?.close();
    console.log("[WebSocket] Notification service shut down");
  }
}

export const wsNotificationService = new NotificationWebSocketService();
