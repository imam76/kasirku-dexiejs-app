import {
  postgresAdapter,
  type PostgresHealth,
} from "@/services/postgresAdapter";
import {
  isSetupConfigured,
  syncSetupConfigFromRemote,
} from "@/services/setupKeyService";
import { isTauriRuntime } from "@/utils/export/platform";
import { HostDatabaseSetup } from "@/view/auth/HostDatabaseSetup";
import { Login } from "@/view/auth/Login";
import { SetupKeyDrawer } from "@/view/auth/SetupKeyDrawer";
import { SetupOwner } from "@/view/auth/SetupOwner";
import { Alert, Button, Spin, Typography } from "antd";
import { useLiveQuery } from "dexie-react-hooks";
import {
  BarChart3,
  DatabaseZap,
  RefreshCw,
  ShieldCheck,
  Store,
  Zap,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ensureDefaultOwner, hasActiveOwner } from "./authService";
import { useAuth } from "./useAuth";

interface AuthGateProps {
  children: ReactNode;
}

type RemoteSetupStatus =
  | "idle"
  | "checking"
  | "configured"
  | "missing"
  | "error";

const { Text, Title } = Typography;

const LoadingScreen = () => (
  <div className="flex min-h-[100dvh] items-center justify-center">
    <Spin size="large" />
  </div>
);

const SetupWelcome = () => (
  <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 p-4">
    <div className="max-w-md text-center">
      <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-white shadow-lg">
        <Store size={32} />
      </div>
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
    </div>
  </div>
);

interface HostDatabaseUnavailableProps {
  health: PostgresHealth | null;
  isChecking: boolean;
  errorMessage?: string | null;
  onReconnect: () => void;
}

const HostDatabaseUnavailable = ({
  health,
  isChecking,
  errorMessage,
  onReconnect,
}: HostDatabaseUnavailableProps) => {
  const isMigrationFailed = health?.status === "migration_failed";
  const statusMessage =
    errorMessage ?? health?.message ?? "Koneksi PostgreSQL belum tersedia.";

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-gray-50 p-4">
      <div className="w-full max-w-xl rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-500 text-white">
            <DatabaseZap size={24} />
          </div>
          <div>
            <Title level={3} className="!mb-0">
              Host Database Belum Siap
            </Title>
            <Text type="secondary">
              Aplikasi menunggu PostgreSQL yang sudah dikonfigurasi siap
              kembali.
            </Text>
          </div>
        </div>

        <Alert
          className="mb-4"
          type={isMigrationFailed ? "error" : "warning"}
          showIcon
          message={
            isMigrationFailed
              ? "Migration database gagal"
              : "Database belum tersedia"
          }
          description={statusMessage}
        />

        <Button
          type="primary"
          size="large"
          block
          className="!h-11"
          loading={isChecking}
          onClick={onReconnect}
          icon={<RefreshCw size={16} />}
        >
          Refresh / Reconnect
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
  const [postgresHealth, setPostgresHealth] = useState<PostgresHealth | null>(
    null,
  );
  const [isCheckingPostgres, setIsCheckingPostgres] = useState(isTauri);
  const [remoteSetupStatus, setRemoteSetupStatus] = useState<RemoteSetupStatus>(
    isTauri ? "idle" : isSetupConfigured() ? "configured" : "missing",
  );
  const [remoteSetupError, setRemoteSetupError] = useState<string | null>(null);
  const [setupCheckRevision, setSetupCheckRevision] = useState(0);
  const isPostgresCheckInFlightRef = useRef(false);

  const setupRequired = isTauri && remoteSetupStatus === "missing";

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

  const checkPostgres = useCallback(async () => {
    if (!isTauri || isPostgresCheckInFlightRef.current) return null;

    isPostgresCheckInFlightRef.current = true;
    setIsCheckingPostgres(true);
    try {
      const health = await postgresAdapter.healthCheck();
      setPostgresHealth(health);
      return health;
    } catch {
      const fallbackHealth: PostgresHealth = {
        available: false,
        status: "unreachable",
        message: "PostgreSQL health check failed.",
      };
      setPostgresHealth(fallbackHealth);
      return fallbackHealth;
    } finally {
      isPostgresCheckInFlightRef.current = false;
      setIsCheckingPostgres(false);
    }
  }, [isTauri]);

  useEffect(() => {
    void checkPostgres();
  }, [checkPostgres]);

  useEffect(() => {
    if (
      !isTauri ||
      !postgresHealth ||
      postgresHealth.available ||
      postgresHealth.status === "unconfigured"
    )
      return;

    const reconnectTimer = window.setInterval(() => {
      void checkPostgres();
    }, 10000);

    return () => window.clearInterval(reconnectTimer);
  }, [checkPostgres, isTauri, postgresHealth]);

  useEffect(() => {
    if (!isTauri || !postgresHealth?.available) return;

    let isActive = true;

    const checkRemoteSetup = async () => {
      setRemoteSetupStatus("checking");
      setRemoteSetupError(null);
      try {
        const remoteConfig = await syncSetupConfigFromRemote();
        if (!isActive) return;

        if (remoteConfig) {
          setRemoteSetupStatus("configured");
          await ensureDefaultOwner();
          if (isActive) {
            setOwnerCheckRevision((current) => current + 1);
          }
          return;
        }

        setRemoteSetupStatus("missing");
        setOwnerCheckRevision((current) => current + 1);
      } catch (error) {
        if (!isActive) return;
        setRemoteSetupStatus("error");
        setRemoteSetupError(
          error instanceof Error
            ? error.message
            : "Gagal membaca konfigurasi setup dari database.",
        );
      }
    };

    checkRemoteSetup();

    return () => {
      isActive = false;
    };
  }, [isTauri, postgresHealth?.available, setupCheckRevision]);

  const handleDatabaseConfigured = useCallback((health: PostgresHealth) => {
    setPostgresHealth(health);
    setRemoteSetupStatus("idle");
    setRemoteSetupError(null);
    setSetupCheckRevision((current) => current + 1);
  }, []);

  const handlePostgresReconnect = useCallback(async () => {
    const health = await checkPostgres();
    if (!health?.available) return;

    setRemoteSetupStatus("idle");
    setRemoteSetupError(null);
    setSetupCheckRevision((current) => current + 1);
  }, [checkPostgres]);

  const handleDrawerClose = useCallback(() => {
    setShowSetupDrawer(false);
    if (isTauri && postgresHealth?.available) {
      setRemoteSetupStatus("idle");
      setSetupCheckRevision((current) => current + 1);
      return;
    }

    setOwnerCheckRevision((current) => current + 1);
  }, [isTauri, postgresHealth?.available]);

  const isWaitingForRemoteSetup =
    isTauri &&
    Boolean(postgresHealth?.available) &&
    (remoteSetupStatus === "idle" || remoteSetupStatus === "checking");
  const isInitialPostgresCheck =
    isTauri && !postgresHealth && isCheckingPostgres;

  if (
    isLoading ||
    hasOwner === null ||
    isInitialPostgresCheck ||
    isWaitingForRemoteSetup
  ) {
    return <LoadingScreen />;
  }

  if (
    isTauri &&
    (!postgresHealth || postgresHealth.status === "unconfigured")
  ) {
    return (
      <HostDatabaseSetup
        health={postgresHealth}
        onConfigured={handleDatabaseConfigured}
      />
    );
  }

  if (isTauri && postgresHealth && !postgresHealth.available) {
    return (
      <HostDatabaseUnavailable
        health={postgresHealth}
        isChecking={isCheckingPostgres}
        onReconnect={handlePostgresReconnect}
      />
    );
  }

  if (isTauri && remoteSetupStatus === "error") {
    return (
      <HostDatabaseUnavailable
        health={postgresHealth}
        isChecking={isCheckingPostgres}
        errorMessage={remoteSetupError}
        onReconnect={handlePostgresReconnect}
      />
    );
  }

  if (!setupRequired && currentUser) {
    return <>{children}</>;
  }

  // Unauthenticated — render Login/SetupOwner + hidden SetupKeyDrawer
  const authContent = (() => {
    if (setupRequired) {
      return <SetupWelcome />;
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
    </>
  );
};
