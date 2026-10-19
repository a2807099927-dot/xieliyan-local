// useCharacterHoverCard 
import { useEffect, useRef } from 'react';
import tippy, { type Instance } from 'tippy.js';

interface UseCharacterHoverCardParams {
 editor: {
 view: { dom: HTMLElement };
 } | null;
 buildCard: (name: string) => HTMLElement;
}

/**
 * Manages character hover tooltip interaction lifecycle for editor marks.
 * Includes delayed show/hide timers, mouseover/out handling, and tippy instance cleanup.
 */
export function useCharacterHoverCard({ editor, buildCard }: UseCharacterHoverCardParams): void {
 const hoverShowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
 const hoverHideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
 const tippyRef = useRef<Instance | null>(null);

 useEffect(() => {
 if (!editor?.view) return;

 const root = editor.view.dom as HTMLElement;
 let activeTarget: HTMLElement | null = null;

 const clearShowTimer = () => {
 if (hoverShowTimerRef.current) {
 clearTimeout(hoverShowTimerRef.current);
 hoverShowTimerRef.current = null;
 }
 };

 const clearHideTimer = () => {
 if (hoverHideTimerRef.current) {
 clearTimeout(hoverHideTimerRef.current);
 hoverHideTimerRef.current = null;
 }
 };

 const hideCard = () => {
 clearShowTimer();
 clearHideTimer();
 tippyRef.current?.hide();
 activeTarget = null;
 };

 const scheduleHide = () => {
 clearHideTimer();
 hoverHideTimerRef.current = setTimeout(() => {
 hideCard();
 }, 450);
 };

 const showCard = (target: HTMLElement) => {
 const name = target.getAttribute('data-character-name') || '';
 if (!name) return;
 clearHideTimer();

 if (!tippyRef.current) {
 tippyRef.current = tippy(target, {
 content: buildCard(name),
 trigger: 'manual',
 placement: 'top-start',
 interactive: true,
 interactiveBorder: 30,
 appendTo: () => document.body,
 theme: 'wz-character',
 arrow: false,
 animation: 'shift-away-subtle'
 });
 } else {
 tippyRef.current.setProps({
 getReferenceClientRect: () => target.getBoundingClientRect()
 });
 tippyRef.current.setContent(buildCard(name));
 }

 tippyRef.current.show();
 const popper = tippyRef.current.popper;
 popper.onmouseenter = () => {
 clearHideTimer();
 };
 popper.onmouseleave = () => {
 scheduleHide();
 };
 activeTarget = target;
 };

 const onMouseOver = (event: Event) => {
 if (event instanceof MouseEvent && event.buttons > 0) return;
 const selection = window.getSelection();
 if (selection && !selection.isCollapsed) return;

 const target = (event.target as HTMLElement).closest('mark[data-character-name]') as HTMLElement | null;
 const isOverPopper = (event.target as HTMLElement).closest('.tippy-box');

 if (!target && !isOverPopper) {
 scheduleHide();
 return;
 }

 if (target) {
 clearHideTimer();
 clearShowTimer();
 hoverShowTimerRef.current = setTimeout(() => {
 if (activeTarget !== target) {
 showCard(target);
 }
 }, 180);
 }
 };

 const onMouseOut = (event: Event) => {
 const related = event instanceof MouseEvent ? (event.relatedTarget as HTMLElement | null) : null;
 const stillInside = related?.closest?.('.tippy-box') || related?.closest?.('mark[data-character-name]');
 if (stillInside) return;
 clearShowTimer();
 clearHideTimer();
 scheduleHide();
 };

 root.addEventListener('mouseover', onMouseOver);
 root.addEventListener('mouseout', onMouseOut);

 return () => {
 root.removeEventListener('mouseover', onMouseOver);
 root.removeEventListener('mouseout', onMouseOut);
 clearShowTimer();
 clearHideTimer();
 if (tippyRef.current) {
 tippyRef.current.destroy();
 tippyRef.current = null;
 }
 };
 }, [editor, buildCard]);
}

