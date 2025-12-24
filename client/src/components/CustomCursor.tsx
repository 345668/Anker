import { useState, useEffect, useRef } from 'react';
import { motion, useMotionValue, useSpring } from 'framer-motion';

interface CursorState {
  isHovering: boolean;
  isClicking: boolean;
}

export function CustomCursor() {
  const [cursorState, setCursorState] = useState<CursorState>({
    isHovering: false,
    isClicking: false,
  });
  const [isVisible, setIsVisible] = useState(false);
  const isVisibleRef = useRef(isVisible);
  isVisibleRef.current = isVisible;

  const cursorX = useMotionValue(0);
  const cursorY = useMotionValue(0);

  const springConfig = { damping: 25, stiffness: 400 };
  const cursorXSpring = useSpring(cursorX, springConfig);
  const cursorYSpring = useSpring(cursorY, springConfig);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      cursorX.set(e.clientX);
      cursorY.set(e.clientY);
      if (!isVisibleRef.current) setIsVisible(true);
    };

    const handleMouseDown = () => {
      setCursorState(prev => ({ ...prev, isClicking: true }));
    };

    const handleMouseUp = () => {
      setCursorState(prev => ({ ...prev, isClicking: false }));
    };

    const handleMouseEnter = () => {
      setIsVisible(true);
    };

    const handleMouseLeave = () => {
      setIsVisible(false);
    };

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const isHoverable = target.closest('a, button, [data-cursor-hover], input, textarea, select, [role="button"]');
      if (isHoverable) {
        setCursorState(prev => ({ ...prev, isHovering: true }));
      }
    };

    const handleMouseOut = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const relatedTarget = e.relatedTarget as HTMLElement | null;
      
      const leftHoverable = target.closest('a, button, [data-cursor-hover], input, textarea, select, [role="button"]');
      const enteredHoverable = relatedTarget?.closest?.('a, button, [data-cursor-hover], input, textarea, select, [role="button"]');
      
      if (leftHoverable && !enteredHoverable) {
        setCursorState(prev => ({ ...prev, isHovering: false }));
      }
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mousedown', handleMouseDown);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('mouseenter', handleMouseEnter);
    document.addEventListener('mouseleave', handleMouseLeave);
    document.addEventListener('mouseover', handleMouseOver, true);
    document.addEventListener('mouseout', handleMouseOut, true);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mousedown', handleMouseDown);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('mouseenter', handleMouseEnter);
      document.removeEventListener('mouseleave', handleMouseLeave);
      document.removeEventListener('mouseover', handleMouseOver, true);
      document.removeEventListener('mouseout', handleMouseOut, true);
    };
  }, [cursorX, cursorY]);

  const isTouchDevice = typeof window !== 'undefined' && 
    ('ontouchstart' in window || navigator.maxTouchPoints > 0);

  if (isTouchDevice) return null;

  return (
    <>
      <style>{`
        * {
          cursor: none !important;
        }
      `}</style>
      
      <motion.div
        className="fixed top-0 left-0 pointer-events-none z-[9999]"
        style={{
          x: cursorXSpring,
          y: cursorYSpring,
          translateX: '-50%',
          translateY: '-50%',
        }}
        animate={{
          scale: cursorState.isClicking ? 0.8 : cursorState.isHovering ? 1.5 : 1,
          opacity: isVisible ? 1 : 0,
        }}
        transition={{ duration: 0.15 }}
      >
        <div 
          className="relative flex items-center justify-center"
          style={{
            width: '28px',
            height: '28px',
          }}
        >
          <motion.div
            className="absolute rounded-full"
            style={{
              width: '28px',
              height: '28px',
              border: '1px solid rgb(122, 122, 122)',
            }}
            animate={{
              borderColor: cursorState.isHovering 
                ? 'rgb(142, 132, 247)' 
                : 'rgb(122, 122, 122)',
            }}
            transition={{ duration: 0.2 }}
          />
          <motion.div
            className="rounded-full"
            style={{
              backgroundColor: 'rgb(142, 132, 247)',
            }}
            animate={{
              width: cursorState.isHovering ? '8px' : '3px',
              height: cursorState.isHovering ? '8px' : '3px',
            }}
            transition={{ duration: 0.2 }}
          />
        </div>
      </motion.div>
    </>
  );
}
