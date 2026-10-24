import { useEffect, useRef } from "react";
import { useNavigate } from "react-router";
import { notificationApi, watchNewMessages } from "./notifications";
import { useSession } from "./SessionProvider";
import { useUserSettings } from "./useSettings";

/**
 * Show browser notifications for new messages while the tab is hidden, when the browser
 * permission is granted and the setting is not off. Clicking one opens the conversation.
 */
export function useNotifications(): void {
  const { client } = useSession();
  const { settings } = useUserSettings();
  const navigate = useNavigate();
  const previewRef = useRef(settings.notificationPreview);

  useEffect(() => {
    previewRef.current = settings.notificationPreview;
  }, [settings.notificationPreview]);

  useEffect(() => {
    const api = notificationApi();
    if (!client || !api) return;
    return watchNewMessages(client, {
      preview: () => previewRef.current,
      hidden: () => document.hidden,
      show: (text, roomId) => {
        if (api.permission !== "granted") return;
        const handle = new api(text, { tag: roomId });
        handle.onclick = () => {
          window.focus();
          void navigate(`/chats/${encodeURIComponent(roomId)}`);
          handle.close();
        };
      },
    });
  }, [client, navigate]);
}
