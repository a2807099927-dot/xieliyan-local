// 模块说明：设置页 写作模式 子面板。
// 统一网格：关闭 + 内置预设 + 自定义配置，每个都是独立可选的写作风格。
import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { clsx } from 'clsx';
import type { AppConfig, StyleProfile } from '../../../types/ai';
import type { SettingsDraftSetter } from './types';
import { BUILTIN_STYLE_PRESET_META } from '../../../ai/stylePresetCatalog';
import { StyleExtractionModal } from './StyleExtractionModal';
import { useBookStore } from '../../../store/useBookStore';
import { toAssetUrl } from '../../../utils/assetUrl';

interface StyleSettingsTabProps {
	draft: AppConfig;
	setDraft: SettingsDraftSetter;
}

function fallbackCoverLabel(title: string): string {
	return String(title || '书').trim().slice(0, 1) || '书';
}

export function StyleSettingsTab({ draft, setDraft }: StyleSettingsTabProps) {
	const profiles = draft.ai.styleProfiles || [];
	// 只把 stylePresetId === 'custom' 的 profile 当作「自定义配置」显示在网格中
	const customProfiles = profiles.filter((p) => p.stylePresetId === 'custom');

	const activeCustomId = draft.ai.activeStyleProfileId || '';
	const activeCustomProfile = customProfiles.find((p) => p.id === activeCustomId);
	const isCustomActive = !!activeCustomProfile;

	const activePresetId = isCustomActive ? '' : (draft.ai.activeStylePresetId ?? '');
	const isOff = !isCustomActive && !activePresetId;

	const [extractionOpen, setExtractionOpen] = useState(false);
	const [editingName, setEditingName] = useState<string | null>(null);
	const [activeDropdownBookId, setActiveDropdownBookId] = useState<string | null>(null);
	const activeBtnRef = useRef<HTMLButtonElement | null>(null);
	const books = useBookStore((s) => s.books);

	// 1. 后台默认开启写作风格缓存，不需要再向用户展示该选项
	useEffect(() => {
		if (draft.ai.styleCacheEnabled !== true) {
			setDraft({
				...draft,
				ai: {
					...draft.ai,
					styleCacheEnabled: true
				}
			});
		}
	}, [draft.ai.styleCacheEnabled, setDraft, draft]);

	// 点击外部关闭下拉菜单
	useEffect(() => {
		const handleClickOutside = () => {
			setActiveDropdownBookId(null);
		};
		document.addEventListener('click', handleClickOutside);
		return () => document.removeEventListener('click', handleClickOutside);
	}, []);

	const handleToggleDropdown = (e: React.MouseEvent, bookId: string) => {
		e.stopPropagation();
		if (activeDropdownBookId === bookId) {
			setActiveDropdownBookId(null);
			activeBtnRef.current = null;
		} else {
			setActiveDropdownBookId(bookId);
			activeBtnRef.current = e.currentTarget as HTMLButtonElement;
		}
	};

	/* ── 自定义配置 CRUD ── */
	const updateCustomProfile = (id: string, updater: (p: StyleProfile) => StyleProfile) => {
		const nextProfiles = profiles.map((p) => (p.id === id ? updater(p) : p));
		setDraft({ ...draft, ai: { ...draft.ai, styleProfiles: nextProfiles } });
	};

	const createCustomProfile = () => {
		const newProfile: StyleProfile = {
			id: crypto.randomUUID(),
			name: `配置 ${customProfiles.length + 1}`,
			stylePresetId: 'custom',
			styleInstruction: ''
		};
		setDraft({
			...draft,
			ai: {
				...draft.ai,
				styleProfiles: [...profiles, newProfile],
				activeStyleProfileId: newProfile.id,
				activeStylePresetId: ''
			}
		});
	};

	const deleteCustomProfile = (id: string) => {
		if (customProfiles.length <= 1) return;
		const nextProfiles = profiles.filter((p) => p.id !== id);
		const fallbackCustom = nextProfiles.find((p) => p.stylePresetId === 'custom');
		books.forEach((book) => {
			if (book.settings?.boundStyleProfileId === id) {
				useBookStore.getState().updateBook(book.id, (b) => ({
					...b,
					settings: { ...b.settings, boundStyleProfileId: undefined }
				}));
			}
		});
		setDraft({
			...draft,
			ai: {
				...draft.ai,
				styleProfiles: nextProfiles,
				activeStyleProfileId: fallbackCustom?.id ?? '',
				activeStylePresetId: fallbackCustom ? '' : (draft.ai.activeStylePresetId ?? '')
			}
		});
	};

	const selectBuiltin = (presetId: string) => {
		setDraft({
			...draft,
			ai: { ...draft.ai, activeStylePresetId: presetId, activeStyleProfileId: '' }
		});
	};

	const selectCustomProfile = (profileId: string) => {
		setDraft({
			...draft,
			ai: { ...draft.ai, activeStyleProfileId: profileId, activeStylePresetId: '' }
		});
	};

	const handleSaveFromExtraction = (name: string, instruction: string) => {
		const newProfile: StyleProfile = {
			id: crypto.randomUUID(),
			name,
			stylePresetId: 'custom',
			styleInstruction: instruction
		};
		setDraft({
			...draft,
			ai: {
				...draft.ai,
				styleProfiles: [...profiles, newProfile],
				activeStyleProfileId: newProfile.id,
				activeStylePresetId: ''
			}
		});
	};

	/* ── 书籍绑定 ── */
	const bindBook = (bookId: string, value: string) => {
		useBookStore.getState().updateBook(bookId, (b) => ({
			...b,
			settings: {
				...b.settings,
				boundStyleProfileId: value || undefined,
			}
		}));
	};

	const boundLabel = (boundId: string): string => {
		if (!boundId) return '未绑定';
		if (boundId === 'off') return '关闭';
		const preset = BUILTIN_STYLE_PRESET_META.find((p) => p.id === boundId);
		if (preset) return preset.label;
		const profile = profiles.find((p) => p.id === boundId);
		if (profile) return profile.name;
		return '未知';
	};

	return (
		<div className="space-y-5">
			<div className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--accent)]" style={{ fontFamily: 'var(--font-display)' }}>
				写作预设与设定
			</div>

			{/* ── 选择写作预设（统一网格） ── */}
			<div className="p-5 rounded-2xl border border-[var(--border-color)] bg-gradient-to-b from-[var(--surface)] to-[var(--surface-strong)] ">
				<div>
					<div className="text-sm font-bold tracking-wide text-[var(--text-primary)]">选择写作预设</div>
					<div className="mt-1 text-xs leading-relaxed text-[var(--text-muted)]">
						选择题材后，续写/改写会自动注入对应的写作技法与风格指令。选择「关闭」则不注入任何预设。
					</div>
				</div>

				<div className="mt-4 grid grid-cols-5 gap-2">
					{/* 关闭 */}
					<button
						type="button"
						onClick={() => selectBuiltin('')}
						className={clsx(
							'px-2 py-2 text-xs font-semibold transition-all duration-200 border text-center flex items-center justify-center rounded-xl focus:outline-none',
							isOff
								? 'border-[var(--accent)] bg-[var(--accent)]/[0.08] text-[var(--accent)] font-bold shadow-[0_0_12px_rgba(99,102,241,0.06)]'
								: 'border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]'
						)}
					>
						关闭
					</button>

					{/* 内置预设 */}
					{BUILTIN_STYLE_PRESET_META.map((preset) => {
						const selected = !isCustomActive && activePresetId === preset.id;
						return (
							<button
								key={preset.id}
								type="button"
								onClick={() => selectBuiltin(preset.id)}
								className={clsx(
									'px-2 py-2 text-xs font-semibold transition-all duration-200 border text-center flex items-center justify-center rounded-xl focus:outline-none',
									selected
										? 'border-[var(--accent)] bg-[var(--accent)]/[0.08] text-[var(--accent)] font-bold shadow-[0_0_12px_rgba(99,102,241,0.06)]'
										: 'border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]'
								)}
							>
								{preset.label}
							</button>
						);
					})}

					{/* 自定义配置 */}
					{customProfiles.map((p) => {
						const selected = isCustomActive && activeCustomId === p.id;
						return (
							<button
								key={p.id}
								type="button"
								onClick={() => selectCustomProfile(p.id)}
								className={clsx(
									'px-2 py-2 text-xs font-semibold transition-all duration-200 border text-center flex items-center justify-center rounded-xl focus:outline-none',
									selected
										? 'border-[var(--accent)] bg-[var(--accent)]/[0.08] text-[var(--accent)] font-bold shadow-[0_0_12px_rgba(99,102,241,0.06)]'
										: 'border-[var(--border-color)] bg-[var(--surface)] text-[var(--text-muted)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]'
								)}
							>
								<span className={clsx(
									'mr-1.5 w-1.5 h-1.5 rounded-full inline-block shrink-0',
									selected ? 'bg-[var(--accent)] shadow-[0_0_6px_var(--accent)]' : 'bg-amber-400/60'
								)} />
								{p.name}
							</button>
						);
					})}

					{/* + 新建 */}
					<button
						type="button"
						onClick={createCustomProfile}
						className="px-2 py-2 text-xs font-semibold transition-all duration-200 border border-dashed border-[var(--border-color)] bg-transparent text-[var(--text-muted)] hover:border-[var(--accent)]/50 hover:text-[var(--text-primary)] text-center flex items-center justify-center rounded-xl focus:outline-none"
					>
						<span className="mr-1 opacity-60">+</span>新建配置
					</button>
				</div>

				{/* 自定义配置编辑区 */}
				{isCustomActive && activeCustomProfile && (
					<div className="mt-4 border-l-4 border-[var(--accent)] border-y border-r border-[var(--border-color)] bg-[var(--surface-strong)] rounded-r-2xl p-5 relative overflow-hidden transition-all duration-300 shadow-lg">
						{/* Background subtle glow */}
						<div className="absolute -right-20 -top-20 w-48 h-48 rounded-full bg-[var(--accent)]/10 blur-[60px] pointer-events-none" />

						{/* Header bar */}
						<div className="flex items-center justify-between pb-2.5 border-b border-[var(--border-color)] mb-3">
							<div className="flex items-center gap-2">
								{editingName === activeCustomProfile.id ? (
									<div className="flex items-center gap-1.5">
										<input
											className="border-b border-indigo-500 bg-transparent px-1 py-0.5 text-sm font-bold text-[var(--text-primary)] outline-none focus:ring-0 w-36"
											value={activeCustomProfile.name}
											onChange={(e) => updateCustomProfile(activeCustomProfile.id, (p) => ({ ...p, name: e.target.value }))}
											onBlur={() => setEditingName(null)}
											onKeyDown={(e) => { if (e.key === 'Enter') setEditingName(null); }}
											autoFocus
										/>
										<span className="text-[10px] text-[var(--text-muted)] opacity-50">(按回车保存)</span>
									</div>
								) : (
									<div className="flex items-center gap-2.5 group">
										<span className="text-sm font-bold text-[var(--text-primary)] tracking-wide">{activeCustomProfile.name}</span>
										<button
											type="button"
											onClick={() => setEditingName(activeCustomProfile.id)}
											className="text-xs text-[var(--accent)] hover:text-[var(--accent)]/80 transition-colors flex items-center gap-1"
										>
											<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
												<path strokeLinecap="round" strokeLinejoin="round" d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
											</svg>
											重命名
										</button>
									</div>
								)}
								<span className="border border-amber-500/25 bg-amber-500/[0.08] rounded-lg px-2 py-0.5 text-[10px] font-semibold text-amber-500 tracking-wider ml-1">
									自定义配置
								</span>
							</div>

							<div className="flex items-center gap-2.5">
								<button
									type="button"
									onClick={() => setExtractionOpen(true)}
									className="flex items-center gap-1.5 text-xs font-bold text-white bg-indigo-500 hover:bg-indigo-600 transition-all px-3 py-1.5 rounded-lg shadow-md active:scale-95"
								>
									<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
										<path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
									</svg>
									AI 提取风格
								</button>

								{customProfiles.length > 1 && (
									<button
										type="button"
										onClick={() => deleteCustomProfile(activeCustomProfile.id)}
										className="flex items-center gap-1.5 text-xs font-semibold text-rose-500 hover:text-rose-600 hover:bg-rose-500/10 transition-colors border border-rose-500/20 px-3 py-1.5 rounded-lg"
									>
										<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
											<path strokeLinecap="round" strokeLinejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
										</svg>
										删除配置
									</button>
								)}
							</div>
						</div>

						{/* Textarea Container with High Contrast & Highlighted border */}
						<div className="relative border border-[var(--border-color)] bg-[var(--surface-strong)] hover:border-[var(--accent)]/40 focus-within:border-[var(--accent)]/50 rounded-xl transition-all duration-300 shadow-inner overflow-hidden">
							<div className="flex items-center justify-between px-4 py-2 bg-[var(--surface)] border-b border-[var(--border-color)] text-[10px] font-bold text-[var(--text-muted)] tracking-wider font-mono">
								<span>写作风格提示词指令 (STYLE PROMPT INSTRUCTION)</span>
								<span className="text-[var(--accent)] font-bold">{activeCustomProfile.styleInstruction?.length || 0} 字</span>
							</div>
							<textarea
								className="w-full h-32 resize-y bg-transparent p-4 text-sm leading-relaxed text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
								placeholder="例如：你是一位擅长细腻心理描写的作家，文风偏向文学性，善用隐喻和意象，节奏舒缓而深刻..."
								value={activeCustomProfile.styleInstruction || ''}
								onChange={(e) => updateCustomProfile(activeCustomProfile.id, (p) => ({ ...p, styleInstruction: e.target.value }))}
							/>
						</div>

						<div className="mt-2 text-[10.5px] text-[var(--text-muted)]">
							提示：当此配置处于选中状态时，您在此处输入的写作风格描述与背景指令，将在调用 AI 续写/改写时自动拼入 system 提示词中。
						</div>
					</div>
				)}
			</div>

			{/* ── 书架绑定 ── */}
			{books.length > 0 && (
				<div className="p-5 rounded-2xl border border-[var(--border-color)] bg-gradient-to-b from-[var(--surface)] to-[var(--surface-strong)] ">
					<div className="text-sm font-bold tracking-wide text-[var(--text-primary)]">书架预设绑定</div>
					<div className="mt-1 text-xs text-[var(--text-muted)] leading-relaxed">
						为特定书籍绑定专属的写作风格。打开该书籍时，系统将自动激活对应的写作模式。
					</div>

					<div className="mt-4 flex flex-wrap gap-4 pb-1">
						{books.map((book) => {
							const coverUrl = toAssetUrl(book.cover);
							const boundId = book.settings?.boundStyleProfileId || '';
							const isDropdownOpen = activeDropdownBookId === book.id;
							return (
								<div key={book.id} className="flex w-[100px] shrink-0 flex-col items-center gap-2.5 group/book">
									{/* Book Cover with 3D Depth Shadow & Spine Effect */}
									<div className={clsx(
										'aspect-[3/4] w-full overflow-hidden border relative rounded-lg transition-all duration-300 shadow-md group-hover/book:translate-y-[-2px] group-hover/book:shadow-lg',
										boundId
											? 'border-indigo-500/50 shadow-[0_0_12px_rgba(99,102,241,0.15)]'
											: 'border-white/10'
									)}>
										{coverUrl ? (
											<img src={coverUrl} alt="" className="h-full w-full object-cover" draggable={false} />
										) : (
											<div className="flex h-full items-center justify-center bg-gradient-to-b from-white/[0.04] to-black/40">
												<span className="text-lg font-light text-white/30" style={{ fontFamily: 'var(--font-title)' }}>
													{fallbackCoverLabel(book.title)}
												</span>
											</div>
										)}

										{/* Spine Shading overlay */}
										<div className="absolute top-0 bottom-0 left-0 w-1.5 bg-gradient-to-r from-black/40 to-transparent pointer-events-none" />

										{/* Active Indicator Label */}
										{boundId && (
											<div className="absolute top-1 right-1 bg-indigo-500 text-white font-extrabold text-[8px] px-1 py-0.5 tracking-tighter uppercase leading-none shadow-sm rounded">
												ACTIVE
											</div>
										)}
									</div>

									{/* Book Title */}
									<div className="w-full truncate text-center text-[11px] font-medium text-[var(--text-muted)] group-hover/book:text-[var(--text-primary)] transition-colors" title={book.title}>
										{book.title}
									</div>

									{/* Custom Styled Dropdown Selector */}
									<div className="w-full relative">
										<button
											type="button"
											onClick={(e) => handleToggleDropdown(e, book.id)}
											className={clsx(
												'w-full border bg-[var(--surface)] hover:bg-[var(--surface-strong)] px-2 py-1.5 text-[11px] transition-all duration-200 text-center pr-5 rounded-lg font-medium flex items-center justify-center relative select-none',
												boundId
													? 'border-indigo-500/50 text-[var(--accent)] font-bold'
													: 'border-[var(--border-color)] text-[var(--text-secondary)] hover:border-[var(--accent)]/40 hover:text-[var(--text-primary)]'
											)}
										>
											<span className="truncate w-full">{boundLabel(boundId)}</span>
											<span className="absolute right-2 top-1/2 -translate-y-1/2 opacity-60 text-[8px] transition-transform duration-200" style={{ transform: isDropdownOpen ? 'translateY(-50%) rotate(180deg)' : 'translateY(-50%)' }}>
												▼
											</span>
										</button>

										{isDropdownOpen && (
											<div className="absolute left-0 right-0 z-[120] mt-1.5 border border-[var(--border-color)] bg-[var(--surface-strong)] shadow-2xl py-1 max-h-60 overflow-y-auto scrollbar-thin rounded-xl"
											>
												<button
													type="button"
													className={clsx(
														"w-full text-left px-3 py-1.5 text-[11px] transition-colors",
														boundId === ''
														? "text-[var(--accent)] bg-[var(--accent)]/[0.06] font-semibold"
														: "text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]"
													)}
													onClick={() => {
														bindBook(book.id, '');
														setActiveDropdownBookId(null);
													}}
												>
													未绑定
												</button>
												<button
													type="button"
													className={clsx(
														"w-full text-left px-3 py-1.5 text-[11px] transition-colors",
														boundId === 'off'
														? "text-[var(--accent)] bg-[var(--accent)]/[0.06] font-semibold"
														: "text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]"
													)}
													onClick={() => {
														bindBook(book.id, 'off');
														setActiveDropdownBookId(null);
													}}
												>
													关闭 (强制不注入)
												</button>

												{/* 内置预设 Group */}
														<div className="px-2.5 py-1 text-[9px] font-bold text-[var(--text-muted)] opacity-70 uppercase tracking-wider border-t border-[var(--border-color)] mt-1">
													内置预设
												</div>
												{BUILTIN_STYLE_PRESET_META.map((preset) => (
													<button
														key={preset.id}
														type="button"
														className={clsx(
															"w-full text-left px-4 py-1.5 text-[11px] transition-colors",
															boundId === preset.id
																? "text-[var(--accent)] bg-[var(--accent)]/[0.06] font-semibold"
																: "text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]"
														)}
														onClick={() => {
															bindBook(book.id, preset.id);
															setActiveDropdownBookId(null);
														}}
													>
														{preset.label}
													</button>
												))}

												{/* 自定义配置 Group */}
												{customProfiles.length > 0 && (
													<>
												<div className="px-2.5 py-1 text-[9px] font-bold text-[var(--text-muted)] opacity-70 uppercase tracking-wider border-t border-[var(--border-color)] mt-1">
															自定义配置
														</div>
														{customProfiles.map((p) => (
															<button
																key={p.id}
																type="button"
																className={clsx(
																	"w-full text-left px-4 py-1.5 text-[11px] transition-colors",
																	boundId === p.id
																		? "text-[var(--accent)] bg-[var(--accent)]/[0.06] font-semibold"
																		: "text-[var(--text-secondary)] hover:bg-[var(--surface)] hover:text-[var(--text-primary)]"
																)}
																onClick={() => {
																	bindBook(book.id, p.id);
																	setActiveDropdownBookId(null);
																}}
															>
																{p.name}
															</button>
														))}
													</>
												)}
											</div>
										)}
									</div>
								</div>
							);
						})}
					</div>
				</div>
			)}


			<StyleExtractionModal
				open={extractionOpen}
				onClose={() => setExtractionOpen(false)}
				onSave={handleSaveFromExtraction}
			/>
		</div>
	);
}
