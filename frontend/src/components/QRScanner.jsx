import { useEffect, useState } from "react";
import { clearQrScanner, createQrScanner } from "../utils";

const QRScanner = ({ scannerId = "qr-reader", onScan }) => {
  const [cameraError, setCameraError] = useState("");

  useEffect(() => {
    let scannerInstance = null;

    const setupScanner = async () => {
      try {
        scannerInstance = createQrScanner(
          scannerId,
          (decodedText) => {
            onScan(decodedText);
          },
          () => {
            // Ignore scan errors/noise, only act on successful scans.
          }
        );
      } catch (error) {
        console.error("QR scanner init failed:", error);
        setCameraError(
          "Camera unavailable. Please allow permissions or use manual token entry."
        );
      }
    };

    setupScanner();

    return () => {
      clearQrScanner(scannerInstance);
    };
  }, [scannerId, onScan]);

  return (
    <>
      <div id={scannerId} />
      {cameraError ? <p className="error">{cameraError}</p> : null}
    </>
  );
};

export default QRScanner;
