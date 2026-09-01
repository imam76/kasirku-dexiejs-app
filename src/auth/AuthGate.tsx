import {
  SETUP_CONFIG_CHANGED_EVENT,
  isSetupConfigured,
} from "@/services/setupKeyService";
import { isTauriRuntime } from "@/utils/export/platform";
import { JoinExistingHostModal } from "@/view/auth/JoinExistingHostModal";
import { Login } from "@/view/auth/Login";
import { SetupKeyDrawer } from "@/view/auth/SetupKeyDrawer";
import { SetupOwner } from "@/view/auth/SetupOwner";
import { Button, Spin } from "antd";
import { useLiveQuery } from "dexie-react-hooks";
import { BarChart3, ServerCog, ShieldCheck, Zap } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { hasActiveOwner } from "./authService";
import { useAuth } from "./useAuth";

interface AuthGateProps {
  children: ReactNode;
}

const LoadingScreen = () => (
  <div className="flex min-h-[100dvh] items-center justify-center">
    <Spin size="large" />
  </div>
);

const SECRET_TAP_THRESHOLD = 10;
const SECRET_TAP_RESET_MS = 1500;

const SetupWelcome = ({
  onJoinHost,
  onStartSetup,
}: {
  onJoinHost: () => void;
  onStartSetup: () => void;
}) => {
  const tapCountRef = useRef(0);
  const tapResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleSecretTap = () => {
    tapCountRef.current += 1;
    if (tapResetTimerRef.current) clearTimeout(tapResetTimerRef.current);

    if (tapCountRef.current >= SECRET_TAP_THRESHOLD) {
      tapCountRef.current = 0;
      onStartSetup();
      return;
    }

    tapResetTimerRef.current = setTimeout(() => {
      tapCountRef.current = 0;
    }, SECRET_TAP_RESET_MS);
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 p-4">
      <div className="max-w-md text-center">
        <img
          src="/frayukti-box-f-logo.png"
          alt="Frayukti"
          onClick={handleSecretTap}
          className="mx-auto mb-6 h-16 w-16 cursor-pointer rounded-2xl shadow-lg"
        />
        <h1 className="mb-2 text-3xl font-bold text-gray-900">
          Selamat Datang di Frayukti
        </h1>
        <p className="mb-8 text-lg text-gray-600">
          Solusi cerdas untuk manajemen bisnis dan operasional kasir Anda.
        </p>
        <div className="grid gap-4 text-left">
          <div className="flex items-start gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Zap size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">
                Manajemen Cepat & Efisien
              </h3>
              <p className="text-sm text-gray-500">
                Kelola produk dan transaksi dengan mudah, dirancang untuk
                kecepatan operasional.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-green-50 text-green-600">
              <BarChart3 size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Laporan Real-time</h3>
              <p className="text-sm text-gray-500">
                Pantau perkembangan dan performa bisnis Anda kapan saja dan di
                mana saja.
              </p>
            </div>
          </div>
          <div className="flex items-start gap-4 rounded-xl border border-gray-100 bg-white p-4 shadow-sm transition-shadow hover:shadow-md">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-purple-50 text-purple-600">
              <ShieldCheck size={20} />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">Keamanan Terjamin</h3>
              <p className="text-sm text-gray-500">
                Sistem yang aman dengan perlindungan data dan sinkronisasi yang
                handal.
              </p>
            </div>
          </div>
        </div>

        <Button
          className="!mt-6"
          size="large"
          icon={<ServerCog size={16} />}
          onClick={onJoinHost}
        >
          Sudah ada host? Hubungkan perangkat ini
        </Button>
      </div>
    </div>
  );
};

export const AuthGate = ({ children }: AuthGateProps) => {
  const { currentUser, isLoading } = useAuth();
  const isTauri = isTauriRuntime();
  const [ownerCheckRevision, setOwnerCheckRevision] = useState(0);
  const hasOwner = useLiveQuery(
    () => hasActiveOwner(),
    [ownerCheckRevision],
    null,
  );
  // Default ke 'register': saat database kosong (belum ada owner), tampilkan
  // halaman daftar Owner dulu, bukan login. Saat sudah ada owner, branch
  // hasOwner di bawah selalu merender <Login /> sehingga nilai ini diabaikan.
  const [authMode, setAuthMode] = useState<"login" | "register">("register");
  const [showSetupDrawer, setShowSetupDrawer] = useState(false);
  const [showJoinHostModal, setShowJoinHostModal] = useState(false);
  const [setupConfigured, setSetupConfigured] = useState(isSetupConfigured);
  const setupRequired = isTauri && !setupConfigured;

  const isLoggedOut = !isLoading && !currentUser;

  // Hidden keyboard shortcut: Ctrl+Shift+? or Cmd+Shift+? (only when not logged in)
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (!isLoggedOut) return;
      // The '?' key is Shift+/ on most keyboards.
      if (
        (e.ctrlKey && e.shiftKey && e.key === "?") ||
        (e.metaKey && e.shiftKey && e.key === "o")
      ) {
        e.preventDefault();
        setShowSetupDrawer((prev) => !prev);
      }
    },
    [isLoggedOut],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    const refreshSetupConfigured = () => {
      setSetupConfigured(isSetupConfigured());
    };

    window.addEventListener(SETUP_CONFIG_CHANGED_EVENT, refreshSetupConfigured);
    return () => {
      window.removeEventListener(
        SETUP_CONFIG_CHANGED_EVENT,
        refreshSetupConfigured,
      );
    };
  }, []);

  const handleDrawerClose = useCallback(() => {
    setShowSetupDrawer(false);
    setSetupConfigured(isSetupConfigured());
    setOwnerCheckRevision((current) => current + 1);
  }, []);

  const handleHostJoined = useCallback(() => {
    setShowJoinHostModal(false);
    setSetupConfigured(isSetupConfigured());
    setOwnerCheckRevision((current) => current + 1);
  }, []);

  if (isLoading || hasOwner === null) {
    return <LoadingScreen />;
  }

  if (!setupRequired && currentUser) {
    return <>{children}</>;
  }

  // Unauthenticated — render Login/SetupOwner + hidden SetupKeyDrawer
  const authContent = (() => {
    if (setupRequired) {
      return (
        <SetupWelcome
          onJoinHost={() => setShowJoinHostModal(true)}
          onStartSetup={() => setShowSetupDrawer(true)}
        />
      );
    }

    if (!hasOwner) {
      if (authMode === "register") {
        return (
          <SetupOwner
            onBackToLogin={() => setAuthMode("login")}
            onComplete={() => setAuthMode("login")}
          />
        );
      }

      return (
        <Login
          registrationAvailable
          onRegister={() => setAuthMode("register")}
        />
      );
    }

    return <Login />;
  })();

  return (
    <>
      {authContent}
      <SetupKeyDrawer
        open={showSetupDrawer}
        onClose={handleDrawerClose}
        forceMode={setupRequired}
      />
      <JoinExistingHostModal
        open={showJoinHostModal}
        onClose={() => setShowJoinHostModal(false)}
        onJoined={handleHostJoined}
      />
    </>
  );
};
