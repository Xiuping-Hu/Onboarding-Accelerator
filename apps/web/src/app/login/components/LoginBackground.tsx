import React from 'react';

export function LoginBackground() {
  const ellipseClass = 'absolute inset-0 block size-full';

  return (
    <div
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden bg-[linear-gradient(125deg,#fae8cb_0%,#f6daaf_100%)] forced-colors:hidden"
      aria-hidden="true"
      data-slot="login-background"
    >
      <div
        className="absolute right-0 bottom-0 aspect-[3/2] w-[max(100vw,150dvh)] [container-type:inline-size]"
        data-slot="login-background-art"
      >
        <span
          className={`${ellipseClass} bg-[linear-gradient(100deg,#f0ecf8_0%,#f8e0ba_38%,#f2cd86_68%,#e9b766_100%)] [clip-path:circle(98.3073cqw_at_38.6719cqw_-19.9219cqw)]`}
        />
        <span
          className={`${ellipseClass} bg-[linear-gradient(125deg,#edb34d_0%,#dda02f_48%,#ce901d_100%)] [clip-path:circle(60.3516cqw_at_59.375cqw_9.8307cqw)]`}
        />
        <span
          className={`${ellipseClass} bg-[linear-gradient(135deg,#fffaf6_0%,#fdf6ef_55%,#faede0_100%)] [clip-path:circle(72.2656cqw_at_43.4245cqw_-4.7526cqw)]`}
        />
        <span
          className={`${ellipseClass} bg-[linear-gradient(135deg,#f5f1f8_0%,#f5e3d0_80%,#ecc37d_100%)] [clip-path:circle(82.2266cqw_at_29.9479cqw_-13.9323cqw)]`}
        />
        <span
          className={`${ellipseClass} bg-white/80 [clip-path:ellipse(70.3125cqw_74.349cqw_at_32.5521cqw_-10.4167cqw)]`}
        />
        <span
          className={`${ellipseClass} bg-[radial-gradient(circle_at_50%_18%,rgb(255_255_255_/_42%)_0%,transparent_42%),linear-gradient(125deg,#f0f0fb_0%,#fbf9fc_52%,#f4f0f7_100%)] [clip-path:ellipse(70.1823cqw_74.2188cqw_at_32.5521cqw_-10.4167cqw)]`}
        />
      </div>
    </div>
  );
}
