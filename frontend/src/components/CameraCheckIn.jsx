import { useEffect, useRef, useState } from 'react';
import { cameraCheckIn } from '../api/p1.js';
import Button from './ui/Button.jsx';

// Bonus G — optional camera check-in (web). Front camera preview,
// MediaPipe Face Detector (free, @mediapipe/tasks-vision): exactly one
// face must be detected, otherwise the server rejects the check-in.
// GPS + accuracy go to the server, which applies the office geofence
// and the 100m accuracy limit and decides. No photo is stored — the
// server only records source='camera'. If face detection cannot load
// (offline / model unavailable), this component says so plainly and
// the user falls back to the normal web check-in button, which does
// NOT claim a camera check.
export default function CameraCheckIn({ onDone, onError }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [active, setActive] = useState(false);
  const [videoReady, setVideoReady] = useState(false);
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const stop = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActive(false);
    setVideoReady(false);
  };
  useEffect(() => stop, []);
  // Wait until the <video> actually has a frame (videoWidth/Height > 0).
  // Calling MediaPipe detectForVideo on a 0x0 frame throws its raw
  // "ROI width and height must be > 0" INTERNAL error — that was the
  // bug in the screenshot. Returns true once a frame is available.
  const waitForFrame = async (ms = 5000) => {
    const started = Date.now();
    while (Date.now() - started < ms) {
      const v = videoRef.current;
      if (v && v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0) return true;
      await new Promise((r) => setTimeout(r, 100));
    }
    const v = videoRef.current;
    return Boolean(v && v.readyState >= 2 && v.videoWidth > 0 && v.videoHeight > 0);
  };
  const start = async () => {
    setStatus('');
    setVideoReady(false);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
      if (await waitForFrame()) setVideoReady(true);
      else setStatus('Camera opened but no frame arrived yet — wait a second, then try again.');
    } catch {
      setStatus('Camera unavailable — allow camera access, or use the normal check-in button.');
      onError?.('Camera unavailable');
    }
  };
  const detectAndCheckIn = async () => {
    setBusy(true);
    setStatus('Detecting face…');
    try {
      // Never hand MediaPipe an empty frame: it throws the raw
      // INTERNAL ROI error seen in the screenshot.
      if (!(await waitForFrame())) {
        setStatus(
          'Camera preview has no frame yet — make sure the preview shows your face, wait a second, then try again. You can still use the normal check-in button.',
        );
        setBusy(false);
        return;
      }
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm',
      );
      const modelAssetPath =
        'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite';
      let detector;
      try {
        detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath, delegate: 'GPU' },
          runningMode: 'VIDEO',
        });
      } catch {
        // Some browsers/devices reject the GPU delegate; CPU still works.
        detector = await FaceDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath, delegate: 'CPU' },
          runningMode: 'VIDEO',
        });
      }
      const video = videoRef.current;
      const result = detector.detectForVideo(video, performance.now());
      const faceCount = result.detections?.length || 0;
      detector.close();
      if (faceCount !== 1) {
        setStatus(
          `Camera check-in rejected: ${faceCount} face(s) detected — exactly one face is required. Use normal check-in or adjust the frame.`,
        );
        setBusy(false);
        return;
      }
      const loc = await new Promise((resolve) => {
        if (!navigator.geolocation) return resolve(null);
        navigator.geolocation.getCurrentPosition(
          (pos) =>
            resolve({ latitude: pos.coords.latitude, longitude: pos.coords.longitude, accuracy: pos.coords.accuracy }),
          () => resolve(null),
          { timeout: 8000, enableHighAccuracy: true },
        );
      });
      if (!loc) {
        setStatus('Location unavailable — camera check-in needs GPS. Use normal check-in instead.');
        setBusy(false);
        return;
      }
      const data = await cameraCheckIn({ ...loc, faceCount });
      setStatus('Camera check-in accepted.');
      stop();
      onDone?.(data);
    } catch (err) {
      const raw = err?.response?.data?.message || err.message || 'Camera check-in failed';
      // Never show MediaPipe's raw INTERNAL/ROI stack text to the user.
      const msg =
        /INTERNAL|CalculatorGraph|ROI width|roi->width/i.test(raw)
          ? 'Face detector received an empty camera frame — wait until the preview shows your face, then try again'
          : raw;
      setStatus(`${msg} — you can still use the normal check-in button.`);
      onError?.(msg);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div>
      {!active && (
        <Button variant="ghost" onClick={start}>
          Open camera
        </Button>
      )}
      {active && (
        <>
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            onLoadedMetadata={() => setVideoReady(true)}
            onCanPlay={() => setVideoReady(true)}
            style={{ width: '100%', maxWidth: 420, borderRadius: 8, background: '#000' }}
          />
          {!videoReady && <p className="muted">Waiting for the camera frame…</p>}
          <p className="page-actions">
            <Button disabled={busy || !videoReady} onClick={detectAndCheckIn}>
              {busy ? 'Checking…' : videoReady ? 'Detect face & check in' : 'Waiting for camera…'}
            </Button>{' '}
            <Button variant="ghost" onClick={stop}>
              Close camera
            </Button>
          </p>
        </>
      )}
      {status && <p className="muted">{status}</p>}
    </div>
  );
}
