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
  const [status, setStatus] = useState('');
  const [busy, setBusy] = useState(false);
  const stop = () => {
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setActive(false);
  };
  useEffect(() => stop, []);
  const start = async () => {
    setStatus('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' } });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setActive(true);
    } catch {
      setStatus('Camera unavailable — allow camera access, or use the normal check-in button.');
      onError?.('Camera unavailable');
    }
  };
  const detectAndCheckIn = async () => {
    setBusy(true);
    setStatus('Detecting face…');
    try {
      const { FaceDetector, FilesetResolver } = await import('@mediapipe/tasks-vision');
      const vision = await FilesetResolver.forVisionTasks(
        'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.1.1/wasm',
      );
      const detector = await FaceDetector.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath:
            'https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite',
          delegate: 'GPU',
        },
        runningMode: 'VIDEO',
      });
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
      const msg = err?.response?.data?.message || err.message || 'Camera check-in failed';
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
            style={{ width: '100%', maxWidth: 420, borderRadius: 8, background: '#000' }}
          />
          <p className="page-actions">
            <Button disabled={busy} onClick={detectAndCheckIn}>
              {busy ? 'Checking…' : 'Detect face & check in'}
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
