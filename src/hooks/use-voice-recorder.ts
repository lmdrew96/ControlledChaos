"use client";

import { useState, useRef, useCallback, useEffect } from "react";

export type RecordingStatus = "idle" | "recording" | "paused" | "stopped" | "error";

interface VoiceRecorderState {
  status: RecordingStatus;
  durationSeconds: number;
  error: string | null;
  audioBlob: Blob | null;
  isSupported: boolean;
}

const MAX_DURATION_SECONDS = 300; // 5 minutes

function detectVoiceSupport(): boolean {
  if (typeof window === "undefined") return false;
  return (
    !!navigator.mediaDevices?.getUserMedia && !!window.MediaRecorder
  );
}

export function useVoiceRecorder() {
  const [state, setState] = useState<VoiceRecorderState>(() => ({
    status: "idle",
    durationSeconds: 0,
    error: null,
    audioBlob: null,
    isSupported: detectVoiceSupport(),
  }));

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const elapsedBeforePauseRef = useRef(0);
  const recordingStartRef = useRef<number>(0);

  const stopTimer = useCallback(() => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const cleanup = useCallback(() => {
    stopTimer();
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
  }, [stopTimer]);

  const startTimer = useCallback(() => {
    recordingStartRef.current = Date.now();
    timerRef.current = setInterval(() => {
      const elapsed = elapsedBeforePauseRef.current + Math.floor((Date.now() - recordingStartRef.current) / 1000);
      setState((prev) => ({ ...prev, durationSeconds: elapsed }));

      if (elapsed >= MAX_DURATION_SECONDS) {
        mediaRecorderRef.current?.stop();
      }
    }, 1000);
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
      elapsedBeforePauseRef.current = 0;

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
      startTimer();

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
  }, [cleanup, startTimer]);

  const pauseRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "recording"
    ) {
      mediaRecorderRef.current.pause();
      // Save elapsed time so we can resume the counter correctly
      elapsedBeforePauseRef.current += Math.floor((Date.now() - recordingStartRef.current) / 1000);
      stopTimer();
      setState((prev) => ({ ...prev, status: "paused" }));
    }
  }, [stopTimer]);

  const resumeRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      mediaRecorderRef.current.state === "paused"
    ) {
      mediaRecorderRef.current.resume();
      startTimer();
      setState((prev) => ({ ...prev, status: "recording" }));
    }
  }, [startTimer]);

  const stopRecording = useCallback(() => {
    if (
      mediaRecorderRef.current &&
      (mediaRecorderRef.current.state === "recording" ||
        mediaRecorderRef.current.state === "paused")
    ) {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const reset = useCallback(() => {
    cleanup();
    elapsedBeforePauseRef.current = 0;
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
    pauseRecording,
    resumeRecording,
    stopRecording,
    reset,
  };
}
