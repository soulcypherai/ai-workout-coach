/**
 * Performance Monitor for fitness auto-detection features
 * Tracks frame rates, processing times, and memory usage
 */

export interface PerformanceMetrics {
  frameRate: number;
  avgProcessingTime: number;
  peakProcessingTime: number;
  droppedFrames: number;
  memoryUsage: number;
  activeDetectors: number;
  lastUpdate: number;
}

export class PerformanceMonitor {
  private metrics: PerformanceMetrics = {
    frameRate: 0,
    avgProcessingTime: 0,
    peakProcessingTime: 0,
    droppedFrames: 0,
    memoryUsage: 0,
    activeDetectors: 0,
    lastUpdate: Date.now()
  };

  private frameTimestamps: number[] = [];
  private processingTimes: number[] = [];
  private readonly SAMPLE_WINDOW = 60; // Keep last 60 samples
  private readonly FPS_WINDOW = 1000; // Calculate FPS over 1 second
  private monitoringInterval: NodeJS.Timeout | null = null;
  private performanceObserver: PerformanceObserver | null = null;

  constructor() {
    this.setupPerformanceObserver();
  }

  private setupPerformanceObserver() {
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      try {
        this.performanceObserver = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'measure' && entry.name.startsWith('pose-detection')) {
              this.recordProcessingTime(entry.duration);
            }
          }
        });
        this.performanceObserver.observe({ entryTypes: ['measure'] });
      } catch (error) {
        console.warn('Performance Observer not available:', error);
      }
    }
  }

  startMonitoring(intervalMs: number = 1000) {
    if (this.monitoringInterval) {
      this.stopMonitoring();
    }

    this.monitoringInterval = setInterval(() => {
      this.updateMetrics();
    }, intervalMs);
  }

  stopMonitoring() {
    if (this.monitoringInterval) {
      clearInterval(this.monitoringInterval);
      this.monitoringInterval = null;
    }
  }

  recordFrame(timestamp: number = performance.now()) {
    this.frameTimestamps.push(timestamp);
    
    // Remove old timestamps outside the FPS window
    const cutoff = timestamp - this.FPS_WINDOW;
    this.frameTimestamps = this.frameTimestamps.filter(t => t > cutoff);
  }

  recordProcessingTime(duration: number) {
    this.processingTimes.push(duration);
    
    // Keep only recent samples
    if (this.processingTimes.length > this.SAMPLE_WINDOW) {
      this.processingTimes.shift();
    }

    // Update peak processing time
    if (duration > this.metrics.peakProcessingTime) {
      this.metrics.peakProcessingTime = duration;
    }
  }

  recordDroppedFrame() {
    this.metrics.droppedFrames++;
  }

  setActiveDetectors(count: number) {
    this.metrics.activeDetectors = count;
  }

  private updateMetrics() {
    // Calculate current frame rate
    if (this.frameTimestamps.length > 1) {
      const timeSpan = this.frameTimestamps[this.frameTimestamps.length - 1] - this.frameTimestamps[0];
      this.metrics.frameRate = (this.frameTimestamps.length - 1) / (timeSpan / 1000);
    }

    // Calculate average processing time
    if (this.processingTimes.length > 0) {
      const sum = this.processingTimes.reduce((a, b) => a + b, 0);
      this.metrics.avgProcessingTime = sum / this.processingTimes.length;
    }

    // Update memory usage if available
    if (typeof window !== 'undefined' && 'performance' in window) {
      const perf = performance as any;
      if (perf.memory) {
        this.metrics.memoryUsage = perf.memory.usedJSHeapSize / (1024 * 1024); // Convert to MB
      }
    }

    this.metrics.lastUpdate = Date.now();
  }

  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  reset() {
    this.frameTimestamps = [];
    this.processingTimes = [];
    this.metrics = {
      frameRate: 0,
      avgProcessingTime: 0,
      peakProcessingTime: 0,
      droppedFrames: 0,
      memoryUsage: 0,
      activeDetectors: 0,
      lastUpdate: Date.now()
    };
  }

  logMetrics() {
    const metrics = this.getMetrics();
    console.group('🎯 Fitness Detection Performance');
    console.log(`Frame Rate: ${metrics.frameRate.toFixed(1)} FPS`);
    console.log(`Avg Processing: ${metrics.avgProcessingTime.toFixed(2)}ms`);
    console.log(`Peak Processing: ${metrics.peakProcessingTime.toFixed(2)}ms`);
    console.log(`Dropped Frames: ${metrics.droppedFrames}`);
    console.log(`Memory Usage: ${metrics.memoryUsage.toFixed(1)} MB`);
    console.log(`Active Detectors: ${metrics.activeDetectors}`);
    console.groupEnd();
  }

  dispose() {
    this.stopMonitoring();
    
    if (this.performanceObserver) {
      this.performanceObserver.disconnect();
      this.performanceObserver = null;
    }
    
    this.reset();
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();