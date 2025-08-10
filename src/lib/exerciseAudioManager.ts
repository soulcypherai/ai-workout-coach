export class ExerciseAudioManager {
  private audioContext: AudioContext | null = null;
  private isInitialized = false;
  private activeOscillators: Set<OscillatorNode> = new Set();
  
  constructor() {
    // Initialize on first user interaction
  }
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    try {
      this.audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      this.isInitialized = true;
      console.log('ExerciseAudioManager initialized');
    } catch (e) {
      console.error('Error creating AudioContext:', e);
    }
  }
  
  async resume(): Promise<void> {
    if (this.audioContext && this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }
  }
  
  playRepComplete(): void {
    if (!this.audioContext) return;
    
    try {
      const currentTime = this.audioContext.currentTime;
      
      // Create a pleasant chime sound
      const playTone = (frequency: number, startTime: number, duration: number) => {
        const oscillator = this.audioContext!.createOscillator();
        const gainNode = this.audioContext!.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext!.destination);
        
        oscillator.frequency.setValueAtTime(frequency, startTime);
        oscillator.type = 'sine';
        
        // Envelope
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.2, startTime + 0.01);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        
        // Track oscillator
        this.activeOscillators.add(oscillator);
        oscillator.onended = () => {
          this.activeOscillators.delete(oscillator);
          gainNode.disconnect();
        };
        
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };
      
      // Play a pleasant two-tone chime
      playTone(523, currentTime, 0.15);       // C5
      playTone(784, currentTime + 0.1, 0.2);  // G5
    } catch (e) {
      console.error('Error playing rep complete sound:', e);
    }
  }
  
  playSetComplete(): void {
    if (!this.audioContext) return;
    
    try {
      const currentTime = this.audioContext.currentTime;
      
      // Create a celebratory sound
      const playTone = (frequency: number, startTime: number, duration: number) => {
        const oscillator = this.audioContext!.createOscillator();
        const gainNode = this.audioContext!.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext!.destination);
        
        oscillator.frequency.setValueAtTime(frequency, startTime);
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(0.3, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };
      
      // Play ascending melody
      playTone(523, currentTime, 0.2);         // C5
      playTone(659, currentTime + 0.15, 0.2);  // E5
      playTone(784, currentTime + 0.3, 0.3);   // G5
      playTone(1047, currentTime + 0.45, 0.4); // C6
    } catch (e) {
      console.error('Error playing set complete sound:', e);
    }
  }
  
  playFormWarning(): void {
    if (!this.audioContext) return;
    
    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      // Lower frequency for warning
      oscillator.frequency.setValueAtTime(200, this.audioContext.currentTime);
      oscillator.type = 'square';
      
      // Short beep
      gainNode.gain.setValueAtTime(0.1, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.1);
      
      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.1);
    } catch (e) {
      console.error('Error playing form warning sound:', e);
    }
  }
  
  playCountdown(count: number): void {
    if (!this.audioContext) return;
    
    try {
      const oscillator = this.audioContext.createOscillator();
      const gainNode = this.audioContext.createGain();
      
      oscillator.connect(gainNode);
      gainNode.connect(this.audioContext.destination);
      
      // Higher pitch for final countdown
      const frequency = count === 0 ? 800 : 600;
      oscillator.frequency.setValueAtTime(frequency, this.audioContext.currentTime);
      oscillator.type = 'sine';
      
      gainNode.gain.setValueAtTime(0.2, this.audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, this.audioContext.currentTime + 0.2);
      
      oscillator.start(this.audioContext.currentTime);
      oscillator.stop(this.audioContext.currentTime + 0.2);
    } catch (e) {
      console.error('Error playing countdown sound:', e);
    }
  }
  
  playPersonalRecord(): void {
    if (!this.audioContext) return;
    
    try {
      const currentTime = this.audioContext.currentTime;
      
      // Create a triumphant fanfare
      const playTone = (frequency: number, startTime: number, duration: number, gain: number = 0.3) => {
        const oscillator = this.audioContext!.createOscillator();
        const gainNode = this.audioContext!.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(this.audioContext!.destination);
        
        oscillator.frequency.setValueAtTime(frequency, startTime);
        oscillator.type = 'sine';
        
        gainNode.gain.setValueAtTime(gain, startTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
        
        oscillator.start(startTime);
        oscillator.stop(startTime + duration);
      };
      
      // Triumphant chord progression
      // C major chord
      playTone(523, currentTime, 0.5, 0.4);         // C5
      playTone(659, currentTime, 0.5, 0.3);         // E5
      playTone(784, currentTime, 0.5, 0.3);         // G5
      
      // G major chord
      playTone(784, currentTime + 0.3, 0.5, 0.4);   // G5
      playTone(988, currentTime + 0.3, 0.5, 0.3);   // B5
      playTone(1175, currentTime + 0.3, 0.5, 0.3);  // D6
      
      // C major chord (octave higher)
      playTone(1047, currentTime + 0.6, 0.6, 0.5);  // C6
      playTone(1319, currentTime + 0.6, 0.6, 0.4);  // E6
      playTone(1568, currentTime + 0.6, 0.6, 0.4);  // G6
    } catch (e) {
      console.error('Error playing personal record sound:', e);
    }
  }
}

// Singleton instance
export const exerciseAudioManager = new ExerciseAudioManager();