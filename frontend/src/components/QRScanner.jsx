import { useEffect } from "react";
import { clearQrScanner, createQrScanner } from "../utils";

const QRScanner = ({ scannerId = "qr-reader", onScan }) => {
  useEffect(() => {
    const scannerInstance = createQrScanner(
      scannerId,
      (decodedText) => {
        onScan(decodedText);
      },
      () => {
        // Ignore scan errors/noise, only act on successful scans.
      }
    );

    return () => {
      clearQrScanner(scannerInstance);
    };
  }, [scannerId, onScan]);

  return <div id={scannerId} />;
};

export default QRScanner;
