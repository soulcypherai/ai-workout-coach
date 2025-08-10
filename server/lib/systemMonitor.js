import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

/**
 * System resource monitoring utilities
 */
export class SystemMonitor {
  constructor() {
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTime = process.hrtime.bigint();
  }

  /**
   * Get current memory usage percentage
   */
  getMemoryUsage() {
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    return Math.round((usedMem / totalMem) * 100);
  }

  /**
   * Get current CPU usage percentage
   * Uses process.cpuUsage() for accurate Node.js process CPU measurement
   */
  getCpuUsage() {
    const currentCpuUsage = process.cpuUsage(this.lastCpuUsage);
    const currentTime = process.hrtime.bigint();
    
    // Calculate elapsed time in microseconds
    const elapsedTime = Number(currentTime - this.lastCpuTime) / 1000;
    
    // CPU usage in microseconds
    const totalCpuTime = currentCpuUsage.user + currentCpuUsage.system;
    
    // Calculate percentage
    const cpuPercent = Math.round((totalCpuTime / elapsedTime) * 100);
    
    // Update for next calculation
    this.lastCpuUsage = process.cpuUsage();
    this.lastCpuTime = currentTime;
    
    return Math.min(cpuPercent, 100); // Cap at 100%
  }

  /**
   * Get system-wide CPU usage percentage (all cores average)
   */
  async getSystemCpuUsage() {
    try {
      const cpus = os.cpus();
      let totalIdle = 0;
      let totalTick = 0;

      cpus.forEach(cpu => {
        for (const type in cpu.times) {
          totalTick += cpu.times[type];
        }
        totalIdle += cpu.times.idle;
      });

      const idle = totalIdle / cpus.length;
      const total = totalTick / cpus.length;
      const usage = 100 - Math.round(100 * idle / total);
      
      return Math.max(0, Math.min(100, usage));
    } catch (error) {
      console.warn('[SystemMonitor] Failed to get system CPU usage:', error.message);
      return this.getCpuUsage(); // Fallback to process CPU usage
    }
  }

  /**
   * Get disk usage percentage for the current working directory
   * Uses platform-specific commands
   */
  async getDiskUsage() {
    try {
      const platform = os.platform();
      let command;
      
      if (platform === 'win32') {
        // Windows: use wmic
        command = `wmic logicaldisk where size!=0 get size,freespace,caption`;
      } else {
        // Unix-like: use df command for current directory
        command = `df -h ${process.cwd()} | tail -1 | awk '{print $5}' | sed 's/%//'`;
      }
      
      const { stdout } = await execAsync(command);
      
      if (platform === 'win32') {
        // Parse Windows output (simplified - would need more robust parsing)
        return 0; // Placeholder for Windows implementation
      } else {
        // Parse Unix df output
        const usage = parseInt(stdout.trim());
        return isNaN(usage) ? 0 : Math.min(100, Math.max(0, usage));
      }
    } catch (error) {
      console.warn('[SystemMonitor] Failed to get disk usage:', error.message);
      return 0; // Return 0 if unable to determine disk usage
    }
  }

  /**
   * Get all system resources at once
   */
  async getResourceUsage() {
    try {
      const [memory, cpu, disk] = await Promise.all([
        Promise.resolve(this.getMemoryUsage()),
        this.getSystemCpuUsage(),
        this.getDiskUsage()
      ]);

      return {
        memory,
        cpu,
        disk,
        timestamp: new Date().toISOString(),
        pid: process.pid,
        uptime: Math.round(process.uptime()),
        nodeMemory: {
          heapUsed: Math.round(process.memoryUsage().heapUsed / 1024 / 1024), // MB
          heapTotal: Math.round(process.memoryUsage().heapTotal / 1024 / 1024), // MB
          external: Math.round(process.memoryUsage().external / 1024 / 1024), // MB
          rss: Math.round(process.memoryUsage().rss / 1024 / 1024) // MB
        }
      };
    } catch (error) {
      console.error('[SystemMonitor] Error getting resource usage:', error);
      
      // Return basic fallback data
      return {
        memory: this.getMemoryUsage(),
        cpu: 0,
        disk: 0,
        timestamp: new Date().toISOString(),
        pid: process.pid,
        uptime: Math.round(process.uptime()),
        error: error.message
      };
    }
  }

  /**
   * Start periodic resource monitoring
   */
  startMonitoring(callback, intervalMs = 60000) {
    console.log(`[SystemMonitor] Starting resource monitoring (interval: ${intervalMs}ms)`);
    
    // Initial reading
    this.getResourceUsage().then(callback).catch(console.error);
    
    // Periodic monitoring
    const interval = setInterval(async () => {
      try {
        const resources = await this.getResourceUsage();
        callback(resources);
      } catch (error) {
        console.error('[SystemMonitor] Error in periodic monitoring:', error);
      }
    }, intervalMs);

    return interval;
  }

  /**
   * Get basic system info for context
   */
  getSystemInfo() {
    return {
      platform: os.platform(),
      arch: os.arch(),
      hostname: os.hostname(),
      cpus: os.cpus().length,
      totalMemory: Math.round(os.totalmem() / 1024 / 1024 / 1024), // GB
      nodeVersion: process.version,
      pid: process.pid
    };
  }
}

// Export singleton instance
export const systemMonitor = new SystemMonitor();

export default systemMonitor;