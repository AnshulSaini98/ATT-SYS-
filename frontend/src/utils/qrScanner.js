import { Html5QrcodeScanner } from "html5-qrcode";

export const createQrScanner = (elementId, onScanSuccess, onScanError) => {
  const scanner = new Html5QrcodeScanner(
    elementId,
    {
      fps: 10,
      qrbox: { width: 220, height: 220 },
    },
    false
  );

  scanner.render(onScanSuccess, onScanError);
  return scanner;
};

export const clearQrScanner = async (scannerInstance) => {
  if (!scannerInstance) {
    return;
  }

  try {
    await scannerInstance.clear();
  } catch (_error) {
    // Scanner may already be cleared during quick unmount/remount cycles.
  }
};
