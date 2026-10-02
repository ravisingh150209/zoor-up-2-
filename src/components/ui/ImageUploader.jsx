import React, { useState, useRef } from 'react';
import { Camera, Image as ImageIcon, Upload, X, RefreshCw, Check, AlertCircle } from 'lucide-react';
import { uploadService } from '../../services/uploadService';
import { Button } from './Button';

/**
 * Universal Reusable Image Uploader for ZOOR UP
 * Supports Gallery file picking, Camera capture, live preview,
 * aspect ratio framing (square, cover, banner, product),
 * upload progress, change photo, and remove photo.
 */
export const ImageUploader = ({
  value,
  onChange,
  aspectRatio = 'square', // 'square' | 'cover' | 'banner' | 'product'
  allowCamera = true,
  allowGallery = true,
  label = '',
  placeholderText = 'Add Photo',
  subText = 'Choose from Gallery or Take Photo',
  entityType = 'general',
  businessId = null,
  userId = null,
  bucket = 'product-images',
  disabled = false,
  className = '',
  style = {}
}) => {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState(null);
  const [showCameraModal, setShowCameraModal] = useState(false);
  const [cameraStream, setCameraStream] = useState(null);

  const fileInputRef = useRef(null);
  const cameraInputRef = useRef(null);
  const videoRef = useRef(null);

  // Aspect ratio styling calculation
  const getContainerStyle = () => {
    switch (aspectRatio) {
      case 'cover':
        return { height: '170px', width: '100%', borderRadius: 'var(--radius-lg)' };
      case 'banner':
        return { height: '120px', width: '100%', borderRadius: 'var(--radius-lg)' };
      case 'product':
        return { height: '180px', width: '100%', borderRadius: 'var(--radius-md)' };
      case 'square':
      default:
        return { width: '120px', height: '120px', borderRadius: 'var(--radius-xl)' };
    }
  };

  const handleFileSelected = async (file) => {
    if (!file) return;
    setError(null);
    setUploading(true);

    try {
      const res = await uploadService.uploadImage(file, {
        entityType,
        businessId,
        userId,
        bucket
      });

      if (res.success && res.url) {
        onChange(res.url);
      } else {
        throw new Error('Upload returned no URL');
      }
    } catch (err) {
      console.error('Image upload failed:', err);
      setError(err.message || 'Failed to upload photo');
    } finally {
      setUploading(false);
      // Reset inputs so the same file can be selected again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  const handleRemove = async (e) => {
    e.stopPropagation();
    if (!value) return;
    try {
      await uploadService.deleteImage(value, { businessId, userId });
    } catch (err) {
      // non-blocking
    }
    onChange(null);
    setError(null);
  };

  // Camera handling for web (getUserMedia webcam stream modal)
  const startWebcam = async () => {
    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment' }
        });
        setCameraStream(stream);
        setShowCameraModal(true);
        setTimeout(() => {
          if (videoRef.current) {
            videoRef.current.srcObject = stream;
            videoRef.current.play();
          }
        }, 100);
      } catch (e) {
        // Fallback to native input capture
        if (cameraInputRef.current) cameraInputRef.current.click();
      }
    } else if (cameraInputRef.current) {
      cameraInputRef.current.click();
    }
  };

  const stopWebcam = () => {
    if (cameraStream) {
      cameraStream.getTracks().forEach((track) => track.stop());
      setCameraStream(null);
    }
    setShowCameraModal(false);
  };

  const capturePhotoFromWebcam = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement('canvas');
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(videoRef.current, 0, 0, canvas.width, canvas.height);

    canvas.toBlob((blob) => {
      stopWebcam();
      if (blob) {
        const file = new File([blob], `cam_${Date.now()}.jpg`, { type: 'image/jpeg' });
        handleFileSelected(file);
      }
    }, 'image/jpeg', 0.9);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem', ...style }} className={className}>
      {label && (
        <label className="form-label" style={{ fontWeight: 600, fontSize: '0.85rem' }}>
          {label}
        </label>
      )}

      {/* Hidden Native Inputs */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif,image/svg+xml"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
        disabled={disabled || uploading}
      />
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        style={{ display: 'none' }}
        onChange={(e) => e.target.files?.[0] && handleFileSelected(e.target.files[0])}
        disabled={disabled || uploading}
      />

      {/* Main Upload Box */}
      <div
        style={{
          ...getContainerStyle(),
          position: 'relative',
          background: value ? '#000' : 'var(--bg-surface-elevated)',
          border: value ? '2px solid var(--border-default)' : '2px dashed var(--border-strong)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: disabled ? 'not-allowed' : 'pointer',
          transition: 'all 0.2s ease',
          boxShadow: value ? 'var(--shadow-md)' : 'none',
        }}
        onClick={() => {
          if (disabled || uploading) return;
          if (!value && fileInputRef.current) {
            fileInputRef.current.click();
          }
        }}
      >
        {value ? (
          // Uploaded Photo Preview
          <>
            <img
              src={value}
              alt={label || 'Uploaded preview'}
              style={{
                width: '100%',
                height: '100%',
                objectFit: aspectRatio === 'cover' || aspectRatio === 'banner' ? 'cover' : 'contain',
                display: 'block',
              }}
            />

            {/* Hover / Overlay Controls */}
            <div
              style={{
                position: 'absolute',
                inset: 0,
                background: 'rgba(9, 13, 22, 0.65)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '0.5rem',
                opacity: 0,
                transition: 'opacity 0.2s',
              }}
              onMouseEnter={(e) => (e.currentTarget.style.opacity = '1')}
              onMouseLeave={(e) => (e.currentTarget.style.opacity = '0')}
            >
              <button
                type="button"
                className="btn btn-sm btn-primary"
                onClick={(e) => {
                  e.stopPropagation();
                  fileInputRef.current?.click();
                }}
                title="Change Photo"
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
              >
                Change
              </button>
              <button
                type="button"
                className="btn btn-sm btn-danger"
                onClick={handleRemove}
                title="Remove Photo"
                style={{ padding: '0.35rem 0.65rem', fontSize: '0.75rem' }}
              >
                Remove
              </button>
            </div>
          </>
        ) : (
          // Empty State: Add Photo Card
          <div
            style={{
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              textAlign: 'center',
              gap: '0.5rem',
              color: 'var(--text-secondary)',
              width: '100%',
              height: '100%',
            }}
          >
            {uploading ? (
              <>
                <RefreshCw size={26} className="animate-spin" style={{ color: 'var(--color-primary)' }} />
                <span style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--color-primary)' }}>
                  Uploading photo...
                </span>
              </>
            ) : (
              <>
                <div
                  style={{
                    width: '42px',
                    height: '42px',
                    borderRadius: '50%',
                    background: 'var(--color-accent-light)',
                    border: '1px solid #FDE68A',
                    color: 'var(--color-accent-dark)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Camera size={22} />
                </div>
                <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)' }}>
                  {placeholderText}
                </div>
                {aspectRatio !== 'square' && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                    {subText}
                  </div>
                )}
                {/* Action Buttons */}
                <div
                  style={{
                    display: 'flex',
                    gap: '0.4rem',
                    marginTop: '0.2rem',
                    flexWrap: 'wrap',
                    justifyContent: 'center',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {allowGallery && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={() => fileInputRef.current?.click()}
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                    >
                      <ImageIcon size={13} style={{ marginRight: '4px' }} />
                      Gallery
                    </button>
                  )}
                  {allowCamera && (
                    <button
                      type="button"
                      className="btn btn-sm btn-outline"
                      onClick={startWebcam}
                      style={{ fontSize: '0.75rem', padding: '0.25rem 0.6rem' }}
                    >
                      <Camera size={13} style={{ marginRight: '4px' }} />
                      Camera
                    </button>
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* External Action Controls if photo exists */}
      {value && !uploading && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.25rem' }}>
          <button
            type="button"
            className="btn btn-sm btn-outline"
            onClick={() => fileInputRef.current?.click()}
            style={{ fontSize: '0.75rem', padding: '0.2rem 0.6rem' }}
          >
            Change Photo
          </button>
          <button
            type="button"
            className="btn btn-sm btn-ghost"
            onClick={handleRemove}
            style={{ fontSize: '0.75rem', color: 'var(--danger-500)', padding: '0.2rem 0.6rem' }}
          >
            Remove
          </button>
        </div>
      )}

      {/* Error Message */}
      {error && (
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px', color: 'var(--danger-500)', fontSize: '0.75rem' }}>
          <AlertCircle size={13} />
          <span>{error}</span>
        </div>
      )}

      {/* Live Camera Viewfinder Modal */}
      {showCameraModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 9999,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '1rem',
          }}
        >
          <div
            style={{
              background: 'var(--bg-surface)',
              borderRadius: 'var(--radius-xl)',
              border: '1px solid var(--border-default)',
              width: '100%',
              maxWidth: '460px',
              padding: '1.25rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem',
              alignItems: 'center',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', width: '100%', alignItems: 'center' }}>
              <div style={{ fontWeight: 700, fontSize: '1rem' }}>Take Photo</div>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={stopWebcam}
                style={{ padding: '4px' }}
              >
                <X size={18} />
              </button>
            </div>

            <div
              style={{
                width: '100%',
                height: '280px',
                borderRadius: 'var(--radius-lg)',
                overflow: 'hidden',
                background: '#000',
                position: 'relative',
              }}
            >
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            </div>

            <div style={{ display: 'flex', gap: '0.75rem', width: '100%' }}>
              <Button variant="outline" style={{ flex: 1 }} onClick={stopWebcam}>
                Cancel
              </Button>
              <Button variant="primary" style={{ flex: 1 }} onClick={capturePhotoFromWebcam}>
                <Camera size={16} style={{ marginRight: '6px' }} />
                Snap Photo
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
