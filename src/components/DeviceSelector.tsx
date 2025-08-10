import React, { useState, useEffect, useRef } from 'react';
import { ChevronUp, Check } from 'lucide-react';
import { Room } from 'livekit-client';

interface Device {
  deviceId: string;
  label: string;
  kind: MediaDeviceKind;
}

interface DeviceSelectorProps {
  type: 'audio' | 'video';
  selectedDeviceId?: string;
  onDeviceChange: (deviceId: string) => void;
  className?: string;
  isRecording?: boolean;
}

export const DeviceSelector: React.FC<DeviceSelectorProps> = ({
  type,
  selectedDeviceId,
  onDeviceChange,
  className = '',
  isRecording = false
}) => {
  const [devices, setDevices] = useState<Device[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [systemDefaultId, setSystemDefaultId] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Get available devices using LiveKit's API
  useEffect(() => {
    const loadDevices = async () => {
      try {
        // Use LiveKit's device enumeration - it handles permissions properly
        const mediaType = type === 'audio' ? 'audioinput' : 'videoinput';
        
        // LiveKit can enumerate devices without creating streams
        const liveKitDevices = await Room.getLocalDevices(mediaType);
        
        // Map to our format
        const filteredDevices = liveKitDevices.map(device => ({
          deviceId: device.deviceId,
          label: device.label || `${type === 'audio' ? 'Microphone' : 'Camera'} ${device.deviceId.slice(0, 8)}`,
          kind: mediaType as MediaDeviceKind
        }));
        
        setDevices(filteredDevices);
        
        // Set the first device as default if no device is selected
        if (filteredDevices.length > 0) {
          const defaultDevice = filteredDevices.find(d => d.deviceId === 'default') || filteredDevices[0];
          setSystemDefaultId(defaultDevice.deviceId);
          
          // Only auto-select for audio devices to avoid triggering camera
          if (!selectedDeviceId && type === 'audio') {
            onDeviceChange(defaultDevice.deviceId);
          }
        }
      } catch (error) {
        console.error('[DeviceSelector] Error enumerating devices:', error);
        
        // Simple fallback without creating any streams
        try {
          const deviceList = await navigator.mediaDevices.enumerateDevices();
          const filteredDevices = deviceList
            .filter(device => device.kind === (type === 'audio' ? 'audioinput' : 'videoinput'))
            .map(device => ({
              deviceId: device.deviceId,
              label: device.label || `${type === 'audio' ? 'Microphone' : 'Camera'} ${device.deviceId.slice(0, 8)}`,
              kind: device.kind as MediaDeviceKind
            }));
          
          setDevices(filteredDevices);
          
          if (filteredDevices.length > 0) {
            setSystemDefaultId(filteredDevices[0].deviceId);
            // Only auto-select for audio to avoid camera issues
            if (!selectedDeviceId && type === 'audio') {
              onDeviceChange(filteredDevices[0].deviceId);
            }
          }
        } catch (fallbackError) {
          console.error('[DeviceSelector] Fallback also failed:', fallbackError);
        }
      }
    };

    loadDevices();

    // Listen for device changes
    navigator.mediaDevices.addEventListener('devicechange', loadDevices);
    return () => {
      navigator.mediaDevices.removeEventListener('devicechange', loadDevices);
    };
  }, [type]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className={`relative ${className}`} ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center px-2 h-12 rounded-r-full border-l transition-all ${
          isRecording 
            ? 'border-l-black/20' 
            : 'border-l-white/10'
        }`}
        aria-label={`Select ${type} device`}
      >
        <ChevronUp className={`h-3.5 w-3.5 ${isRecording ? 'text-black' : 'text-white'} ${isOpen ? 'rotate-180' : ''} transition-transform`} />
      </button>

      {isOpen && devices.length > 0 && (
        <div className="absolute bottom-full mb-2 left-0 min-w-[240px] border-border bg-black/30 backdrop-blur-md rounded-2xl border overflow-hidden z-[9999]">
          <div className="py-1">
            {devices.map(device => (
              <button
                key={device.deviceId}
                onClick={() => {
                  onDeviceChange(device.deviceId);
                  setIsOpen(false);
                }}
                className="w-full px-3 py-2 text-left text-sm text-white hover:bg-white/10 flex items-center justify-between group transition-colors"
              >
                <span className="truncate pr-2">
                  {device.deviceId === 'default' ? (
                    // For the "default" device, show just the device name without "Default - "
                    device.label.replace('Default - ', '')
                  ) : (
                    device.label
                  )}
                  {(device.deviceId === systemDefaultId || device.deviceId === 'default') && (
                    <span className="text-xs text-gray-400 ml-1">(System Default)</span>
                  )}
                </span>
                {device.deviceId === selectedDeviceId && (
                  <Check className="h-4 w-4 text-green-400 flex-shrink-0" />
                )}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};