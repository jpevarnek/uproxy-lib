// Abstract SOCKS session.
interface SocksSession {
  onRemoteData: (buffer: ArrayBuffer) => void;
  onRemoteDisconnect: () => void;
}

export = SocksSession;
