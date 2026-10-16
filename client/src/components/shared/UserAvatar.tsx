import React, { useState } from 'react';
import { AvatarPresetIcon } from '../icons/AvatarPresets';
import { BADGE_FRAME_EMOJI, BADGE_FRAME_RING, FRAME_RINGS, useCosmetic } from '../../utils/unlocks';

interface UserAvatarProps {
  name: string;
  color: string;
  size?: number;
  avatarType?: 'letter' | 'preset' | 'photo';
  avatarPreset?: string | null;
  avatarPhotoUrl?: string | null;
}

/** The person's unlocked frame (Unlockables): pass userId to use the one they picked, or frame to show one */
interface FramedAvatarProps extends UserAvatarProps {
  userId?: number | null;
  frame?: string | null;
  frameIcon?: string;
}

const AvatarCore: React.FC<UserAvatarProps> = ({
  name,
  color,
  size = 38,
  avatarType = 'letter',
  avatarPreset,
  avatarPhotoUrl,
}) => {
  const [photoError, setPhotoError] = useState(false);

  // Photo mode
  if (avatarType === 'photo' && avatarPhotoUrl && !photoError) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '35%',
          overflow: 'hidden',
          border: `2px solid ${color}66`,
          flexShrink: 0,
        }}
      >
        <img
          src={avatarPhotoUrl}
          alt={name}
          onError={() => setPhotoError(true)}
          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
        />
      </div>
    );
  }

  // Preset mode
  if (avatarType === 'preset' && avatarPreset) {
    return (
      <div
        style={{
          width: size,
          height: size,
          borderRadius: '35%',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          flexShrink: 0,
        }}
      >
        <AvatarPresetIcon presetId={avatarPreset} size={size} />
      </div>
    );
  }

  // Letter mode (default/fallback)
  const letter = name.charAt(0).toUpperCase();
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '35%',
        background: `linear-gradient(135deg, ${color}44, ${color}22)`,
        border: `2px solid ${color}66`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: size * 0.4,
        fontWeight: 800,
        color,
        flexShrink: 0,
      }}
    >
      {letter}
    </div>
  );
};

const UserAvatar: React.FC<FramedAvatarProps> = ({ userId, frame, frameIcon, ...props }) => {
  const cosmetic = useCosmetic(userId);
  const f = frame !== undefined ? frame : cosmetic?.frame ?? null;
  const icon = frame !== undefined ? frameIcon : cosmetic?.frameIcon;
  const ring = f ? (f.startsWith('badge:') ? BADGE_FRAME_RING : FRAME_RINGS[f]) : undefined;
  if (!ring) return <AvatarCore {...props} />;
  const size = props.size ?? 38;
  const pad = size >= 60 ? 4 : size >= 30 ? 3 : 2;
  return (
    <span style={{ position: 'relative', display: 'inline-flex', padding: pad, borderRadius: '50%', background: ring, flexShrink: 0 }}>
      <AvatarCore {...props} />
      {icon && BADGE_FRAME_EMOJI[icon] && (
        <span aria-hidden="true" style={{ position: 'absolute', right: -2, bottom: -2, fontSize: Math.max(10, size * 0.32), lineHeight: 1 }}>{BADGE_FRAME_EMOJI[icon]}</span>
      )}
    </span>
  );
};

export { UserAvatar };
export default UserAvatar;
