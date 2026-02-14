"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export type RecordingStatus = "idle" | "recording" | "stopped" | "error";

interface VoiceRecorderState {
  status: RecordingStatus;
  durationSeconds: number;
  error: string | null;
  audioBlob: Blob | null;
  isSupported: boolean;
}

const MAX_DURATION_SECONDS = 300; // 5 minutes

export function useVoiceRecorder() {
  const [state, setState] = useState<VoiceRecorderState>({
    status: "idle",
    durationSeconds: 0,
    error: null,
    audioBlob: null,
    isSupported: false,
  });

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  // Check browser support on mount
  useEffect(() => {
    const supported =
      typeof window !== "undefined" &&
      !!navigator.mediaDevices?.getUserMedia &&
      !!window.MediaRecorder;

    setState((prev) => ({ ...prev, isSupported: supported }));
  }, []);

  const cleanup = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
        },
      });

      streamRef.current = stream;
      chunksRef.current = [];

      // Prefer webm/opus, fall back for Safari
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : "audio/mp4";

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          chunksRef.current.push(e.data);
        }
      };

      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        setState((prev) => ({
          ...prev,
          status: "stopped",
          audioBlob: blob,
        }));
        cleanup();
      };

      recorder.onerror = () => {
        setState((prev) => ({
          ...prev,
          status: "error",
          error: "Recording failed",
        }));
        cleanup();
      };

      recorder.start(1000);

      // Start duration timer
      const startTime = Date.now();
      timerRef.current = setInterval(() => {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        setState((prev) => ({ ...prev, durationSeconds: elapsed }));

        if (elapsed >= MAX_DURATION_SECONDS) {
          recorder.stop();
        }
      }, 1000);

      setState((prev) => ({
        ...prev,
        status: "recording",
        durationSeconds: 0,
        error: null,
        audioBlob: null,
      }));
    } catch (err) {
      const message =
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Microphone access denied. Please allow microphone access in your browser settings."
          : "Could not start recording";

      setState((prev) => ({
        ...prev,
        status: "error",
        error: message,
      }));
    }
  }, [cleanup]);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const reset = useCallback(() => {
    cleanup();
    setState((prev) => ({
      ...prev,
      status: "idle",
      durationSeconds: 0,
      error: null,
      audioBlob: null,
    }));
  }, [cleanup]);

  // Cleanup on unmount
  useEffect(() => {
    return () => cleanup();
  }, [cleanup]);

  return {
    ...state,
    startRecording,
    stopRecording,
    reset,
  };
}
