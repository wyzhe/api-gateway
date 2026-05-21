import { Toaster } from "sonner";
import { useTheme } from "@/lib/theme";

export function ThemedToaster() {
  const { resolved } = useTheme();
  return (
    <Toaster
      theme={resolved}
      richColors
      position="bottom-right"
      toastOptions={{
        classNames: {
          toast: "bg-surface-2 border border-border text-foreground",
        },
      }}
    />
  );
}
