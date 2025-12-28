import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Bell, Check, CheckCheck, Trash2, X, Briefcase, FileText, TrendingUp, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useNotifications } from "@/hooks/use-notifications";
import { formatDistanceToNow } from "date-fns";

interface NotificationCenterProps {
  userId: string | undefined;
}

const typeIcons: Record<string, typeof Briefcase> = {
  deal_created: Briefcase,
  deal_update: TrendingUp,
  deal_stage_change: TrendingUp,
  document_uploaded: FileText,
  message_received: MessageSquare,
};

const typeColors: Record<string, string> = {
  deal_created: "rgb(142,132,247)",
  deal_update: "rgb(196,227,230)",
  deal_stage_change: "rgb(251,194,213)",
  document_uploaded: "rgb(142,132,247)",
  message_received: "rgb(196,227,230)",
};

export function NotificationCenter({ userId }: NotificationCenterProps) {
  const [isOpen, setIsOpen] = useState(false);
  const {
    notifications,
    unreadCount,
    isLoading,
    isConnected,
    markAsRead,
    markAllAsRead,
    deleteNotification,
  } = useNotifications(userId);

  const handleNotificationClick = (notification: any) => {
    if (!notification.isRead) {
      markAsRead(notification.id);
    }
  };

  return (
    <Popover open={isOpen} onOpenChange={setIsOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative text-white/70 hover:text-white hover:bg-white/10"
          data-testid="button-notifications"
        >
          <Bell className="w-5 h-5" />
          {unreadCount > 0 && (
            <motion.span
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              className="absolute -top-1 -right-1 w-5 h-5 rounded-full bg-[rgb(142,132,247)] text-white text-xs font-medium flex items-center justify-center"
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </motion.span>
          )}
          {isConnected && (
            <span className="absolute bottom-1 right-1 w-2 h-2 rounded-full bg-emerald-400" />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent 
        className="w-96 p-0 bg-[rgb(18,18,18)] border-white/10"
        align="end"
        data-testid="notification-panel"
      >
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-medium text-white">Notifications</h3>
            {unreadCount > 0 && (
              <Badge variant="secondary" className="bg-[rgb(142,132,247)]/20 text-[rgb(142,132,247)]">
                {unreadCount} new
              </Badge>
            )}
          </div>
          {unreadCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => markAllAsRead()}
              className="text-white/50 hover:text-white hover:bg-white/10 text-xs gap-1"
              data-testid="button-mark-all-read"
            >
              <CheckCheck className="w-3 h-3" />
              Mark all read
            </Button>
          )}
        </div>

        <ScrollArea className="max-h-[400px]">
          {isLoading ? (
            <div className="p-8 text-center">
              <div className="w-6 h-6 border-2 border-[rgb(142,132,247)] border-t-transparent rounded-full animate-spin mx-auto" />
            </div>
          ) : notifications.length === 0 ? (
            <div className="p-8 text-center">
              <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-white/5 flex items-center justify-center">
                <Bell className="w-6 h-6 text-white/30" />
              </div>
              <p className="text-white/50 text-sm">No notifications yet</p>
            </div>
          ) : (
            <AnimatePresence>
              {notifications.map((notification) => {
                const Icon = typeIcons[notification.type] || Bell;
                const color = typeColors[notification.type] || "rgb(142,132,247)";
                
                return (
                  <motion.div
                    key={notification.id}
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: 20 }}
                    className={`p-4 border-b border-white/5 hover:bg-white/5 cursor-pointer transition-colors ${
                      !notification.isRead ? "bg-white/5" : ""
                    }`}
                    onClick={() => handleNotificationClick(notification)}
                    data-testid={`notification-item-${notification.id}`}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0"
                        style={{ backgroundColor: `${color}20` }}
                      >
                        <Icon className="w-5 h-5" style={{ color }} />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <p className="text-white font-medium text-sm truncate">
                            {notification.title}
                          </p>
                          {!notification.isRead && (
                            <span className="w-2 h-2 rounded-full bg-[rgb(142,132,247)] flex-shrink-0" />
                          )}
                        </div>
                        {notification.message && (
                          <p className="text-white/50 text-xs line-clamp-2">
                            {notification.message}
                          </p>
                        )}
                        <p className="text-white/30 text-xs mt-1">
                          {formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {!notification.isRead && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="w-7 h-7 text-white/30 hover:text-white hover:bg-white/10"
                            onClick={(e) => {
                              e.stopPropagation();
                              markAsRead(notification.id);
                            }}
                            data-testid={`button-mark-read-${notification.id}`}
                          >
                            <Check className="w-3 h-3" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          className="w-7 h-7 text-white/30 hover:text-red-400 hover:bg-red-400/10"
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteNotification(notification.id);
                          }}
                          data-testid={`button-delete-${notification.id}`}
                        >
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}
        </ScrollArea>

        {notifications.length > 0 && (
          <div className="p-3 border-t border-white/10">
            <Button
              variant="ghost"
              size="sm"
              className="w-full text-white/50 hover:text-white hover:bg-white/10 text-xs"
              onClick={() => setIsOpen(false)}
              data-testid="button-close-notifications"
            >
              Close
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
