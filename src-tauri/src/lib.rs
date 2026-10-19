// 写梨眼 Tauri 2 后端入口
mod ai;
mod commands;
mod genre;
mod logger;
mod prompts;
mod protocols;
mod workspace;

use commands::ai::AiAbortState;
use commands::windows::WindowsState;
use commands::scale::ScaleState;
use commands::embedded::EmbeddedState;
use tauri::{LogicalPosition, LogicalSize, Manager, PhysicalSize};

/// 获取加密存储的 prompt（前端通过 invoke 调用）
#[tauri::command]
fn get_encrypted_prompt(id: String) -> Result<String, String> {
    prompts::registry::get_prompt(&id).ok_or_else(|| format!("prompt '{}' not found", id))
}

/// 获取指定题材的提示词包（profile JSON + seed SQL 文本对）。
/// 返回结构：{ "profile": "...", "seedSql": "..." }；无该题材时返回 null。
#[tauri::command]
fn get_genre_pack(genre: String) -> Result<Option<serde_json::Value>, String> {
    Ok(genre::registry::get_pack(&genre).map(|pack| {
        serde_json::json!({ "profile": pack.profile_json, "seedSql": pack.seed_sql })
    }))
}

/// 列出所有可用题材 id。
#[tauri::command]
fn list_genre_packs() -> Result<Vec<String>, String> {
    Ok(genre::registry::list_genres())
}
/// 启动时把主窗口 clamp 到当前显示器内。
///
/// 背景：tauri.conf.json 里默认 1920×1080，对 MacBook（1440×900 / 1512×982）和小笔记本来说大于屏幕，
/// 而无边框窗口（decorations=false）从屏幕外没法直接拖回来 —— 用户看到的就是"窗口只显示一部分、拖不动"。
///
/// 策略：拿当前显示器的可用区域，把窗口缩到 `min(width, monitor_w - margin)` 并居中。
fn clamp_main_window_to_monitor(window: &tauri::WebviewWindow) {
    let Some(monitor) = window.current_monitor().ok().flatten() else { return };
    let scale = monitor.scale_factor();
    let mon_size: LogicalSize<f64> = PhysicalSize::new(
        monitor.size().width as f64,
        monitor.size().height as f64,
    )
    .to_logical(scale);
    let mon_pos: LogicalPosition<f64> = tauri::PhysicalPosition::new(
        monitor.position().x as f64,
        monitor.position().y as f64,
    )
    .to_logical(scale);

    // macOS 顶部有约 24px 菜单栏 + Dock，留 60px 富余
    let margin = 60.0;
    let min_w = 900.0;
    let min_h = 640.0;
    let max_w = (mon_size.width - margin).max(min_w);
    let max_h = (mon_size.height - margin).max(min_h);

    let Ok(cur_size_phys) = window.inner_size() else { return };
    let cur_size: LogicalSize<f64> = PhysicalSize::new(
        cur_size_phys.width as f64,
        cur_size_phys.height as f64,
    )
    .to_logical(scale);

    let new_w = cur_size.width.clamp(min_w, max_w);
    let new_h = cur_size.height.clamp(min_h, max_h);
    let mut changed = false;
    if (cur_size.width - new_w).abs() > 0.5 {
        changed = true;
    }
    if (cur_size.height - new_h).abs() > 0.5 {
        changed = true;
    }

    if changed {
        let _ = window.set_size(LogicalSize::new(new_w, new_h));
        // 居中：相对当前显示器（多屏时不要跨屏）
        let cx = mon_pos.x + (mon_size.width - new_w) / 2.0;
        let cy = mon_pos.y + (mon_size.height - new_h) / 2.0;
        let _ = window.set_position(LogicalPosition::new(cx.max(mon_pos.x), cy.max(mon_pos.y)));
        crate::logger::warn(format!(
            "[startup] clamped main window to {:.0}x{:.0} on monitor {:.0}x{:.0}",
            new_w, new_h, mon_size.width, mon_size.height
        ));
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .register_uri_scheme_protocol("ly-asset", protocols::ly_asset::handle_request)
        .register_uri_scheme_protocol("nb-bridge", protocols::nb_bridge::handle_request)
        .register_uri_scheme_protocol("aiweb-bridge", protocols::aiweb_bridge::handle_request)
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_window_state::Builder::new().build())
        .manage(AiAbortState::new())
        .manage(WindowsState::new())
        .manage(ScaleState::new())
        .manage(EmbeddedState::new())
        .setup(|app| {
            commands::scale::init_scale(&app.handle());
            logger::init(&app.handle());
            // 启动后下一帧 clamp 主窗口（必须在窗口已经显示后才能拿到正确的 monitor）
            if let Some(main) = app.get_webview_window("main") {
                clamp_main_window_to_monitor(&main);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // prompt registry
            get_encrypted_prompt,
            // genre packs
            get_genre_pack,
            list_genre_packs,
            // fs commands
            commands::fs::select_folder,
            commands::fs::select_file,
            commands::fs::select_save_path,
            commands::fs::init_workspace,
            commands::fs::load_books,
            commands::fs::save_book,
            commands::fs::patch_book_settings,
            commands::fs::patch_book_meta,
            commands::fs::delete_book,
            commands::fs::load_chapter_content,
            commands::fs::save_chapter_content,
            commands::fs::patch_chapter,
            commands::fs::load_history_snapshots,
            commands::fs::save_history_snapshot,
            commands::fs::load_memory_bank,
            commands::fs::save_memory_bank,
            commands::fs::load_memory_history,
            commands::fs::save_memory_history,
            commands::fs::delete_memory_history,
            commands::fs::clear_memory_history,
            commands::fs::export_txt,
            commands::fs::export_markdown,
            commands::fs::export_pdf,
            commands::fs::import_txt,
            commands::fs::import_wallpaper,
            commands::fs::import_book_cover,
            commands::fs::backup_workspace,
            commands::fs::backup_book,
            commands::fs::save_text_file,
            commands::fs::read_text_file,
            commands::fs::load_settings,
            commands::fs::save_settings,
            // config commands
            commands::config::config_load,
            commands::config::config_save,
            commands::config::config_reset,
            commands::config::config_get_api_key,
            // resources commands
            commands::resources::add_role,
            commands::resources::delete_role,
            commands::resources::update_role,
            commands::resources::update_role_detail,
            commands::resources::update_character,
            commands::resources::get_role_detail,
            commands::resources::add_category,
            commands::resources::delete_category,
            commands::resources::rename_category,
            commands::resources::extract_roles,
            commands::resources::import_extracted_roles,
            commands::resources::cleanup_residue,
            commands::resources::save_avatar,
            commands::resources::storage::update_book_resource_meta,
            // ai commands
            commands::ai::ai_chat,
            commands::ai::ai_abort,
            commands::ai::ai_validate,
            commands::ai::ai_get_provider_models,
            commands::ai::ai_get_local_models,
            commands::ai::ai_get_style_prompt,
            commands::ai::ai_get_style_extraction_prompt,
            commands::ai::ai_get_arc_planner_prompt,
            commands::ai::get_technique_analysis_prompt,
            commands::ai::get_batch_generate_prompt,
            commands::ai::get_story_planning_prompt,
            commands::ai::web_search,
            commands::http_fetch::http_fetch,
            commands::ai::ai_get_logs,
            commands::ai::ai_clear_logs,
            commands::ai::ai_benchmark_links,
            commands::ai::ai_inspiration_search,
            // system commands
            commands::system::get_app_version,
            commands::system::window_minimize,
            commands::system::window_maximize,
            commands::system::window_close,
            commands::system::toggle_dev_tools,
            commands::system::open_external,

            commands::system::set_window_size,
            // windows (multi-window)
            commands::windows::open_agent_window,
            commands::windows::open_continuation_window,
            commands::windows::open_outline_window,
            commands::windows::open_outline_board_window,
            commands::windows::open_novel_lab_window,
            commands::windows::get_agent_window_state,
            commands::windows::get_continuation_window_state,
            commands::windows::submit_agent_window_bridge_request,
            commands::windows::submit_agent_window_bridge_response,
            commands::windows::submit_continuation_window_action,
            commands::windows::aiweb_open,
            commands::windows::aiweb_hide,
            commands::windows::aiweb_reload,
            commands::windows::aiweb_execute_js,
            commands::windows::aiweb_status,
            commands::windows::aiweb_shell_action,
            commands::windows::toolbox_open,
            commands::windows::toolbox_hide,
            commands::windows::toolbox_action,
            commands::windows::open_book_sweeper_window,
            commands::windows::fetch_qidian_rank,
            commands::windows::fetch_fanqie_rank,
            commands::windows::fetch_qidian_chapters,
            commands::windows::fetch_qidian_description,
            commands::windows::fetch_qidian_chapter_content,
            commands::windows::fetch_fanqie_chapters,
            commands::windows::fetch_fanqie_chapter_content,
            // scale (UI zoom)
            commands::scale::scale_get,
            commands::scale::scale_set,
            commands::scale::scale_zoom_in,
            commands::scale::scale_zoom_out,
            commands::scale::scale_reset,
            // webdav (cloud sync)
            commands::webdav::webdav_test,
            commands::webdav::webdav_upload,
            commands::cloud::cloud_sync_test,
            commands::cloud::cloud_sync_upload,
            commands::cloud::cloud_sync_download,
            commands::cloud::oauth::cloud_oauth_authorize,
            commands::cloud::oauth::cloud_oauth_status,
            commands::webdav::webdav_download,
            // agent (task preparation)
            commands::agent::agent_prepare_task,
            commands::agent::agent_status,
            // user-confirmed skill persistence
            commands::user_skill_store::user_skills_load,
            commands::user_skill_store::user_skills_save,
            commands::user_skill_store::app_data_path,
            // logs
            commands::logs::logs_get_info,
            commands::logs::logs_open_folder,
            commands::logs::logs_get_content,
            commands::logs::logs_report_error,
            // embedded webviews (NovelLab 内嵌浏览器 / AI 网页等)
            commands::embedded::novel_browser_open,
            commands::embedded::novel_browser_navigate,
            commands::embedded::novel_browser_set_region,
            commands::embedded::novel_browser_execute_js,
            commands::embedded::novel_browser_exec_response,
            commands::embedded::novel_browser_close,
            commands::embedded::novel_browser_hide,
            // Agent 独立隐藏 webview（P2-C1，看章节用，不依赖 NovelLab 窗口）
            commands::embedded::agent_browser_open,
            commands::embedded::agent_browser_navigate,
            commands::embedded::agent_browser_execute_js,
            commands::embedded::agent_browser_close,
            // novel lab
            commands::novel_lab::novel_lab_select_save_path,
            commands::novel_lab::novel_lab_save_chapter,
            commands::novel_lab::novel_lab_save_book_index,
            commands::novel_lab::novel_lab_list_archives,
            commands::novel_lab::novel_lab_load_book,
            commands::novel_lab::novel_lab_delete_book,
            commands::novel_lab::novel_lab_save_analysis,
            commands::novel_lab::novel_lab_list_analyses,
            commands::novel_lab::novel_lab_load_analysis,
            commands::novel_lab::novel_lab_import_txt,
            commands::novel_lab::novel_lab_analyze,
            commands::novel_lab::novel_lab_analyze_abort,
            commands::novel_lab::config_set_novel_lab_path,
            commands::novel_lab::config_get_novel_lab_path,
        ])
        .run(tauri::generate_context!())
        .expect("写梨眼启动失败");
}
