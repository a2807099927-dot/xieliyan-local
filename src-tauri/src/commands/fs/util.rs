// 共享工具：HTML 标签剥离 / HTML 转义 / data: URL 编码

/// HTML 标签剥离 + 段落换行还原 + 常见实体反转义
///
/// 修复点：
/// Tiptap 编辑器每段正文是一个 `<p>` 标签，直接 strip 标签会把所有段落拼成一行。
/// 正确做法：先把块级结束标签（`</p>` `</div>` `</h1..6>` `<br>`）替换为 `\n`，
/// 再去掉剩余 HTML 标签，确保导出 TXT / PDF 时段落结构正确保留。
pub(super) fn strip_html(html: &str) -> String {
    use regex::Regex;

    // 步骤1：先整体移除 <script>/<style> 及其内容（大小写不敏感、跨行）
    let script_style_re =
        Regex::new(r"(?is)<(script|style)\b[^>]*>.*?</\s*(script|style)\s*>").unwrap();
    let s = script_style_re.replace_all(html, "");

    // 步骤2：块级结束标签 / 换行标签 → 换行符（大小写不敏感）
    let block_re = Regex::new(r"(?i)</(p|div|h[1-6]|li|tr|blockquote)\s*>|<br\s*/?>").unwrap();
    let s = block_re.replace_all(&s, "\n");

    // 步骤3：剔离剩余所有 HTML 标签
    let tag_re = Regex::new(r"(?s)<[^>]*>").unwrap();
    let s = tag_re.replace_all(&s, "");

    // 步骤4：HTML 实体反转义
    let out = s
        .replace("&nbsp;", " ")
        .replace("&amp;", "&")
        .replace("&lt;", "<")
        .replace("&gt;", ">")
        .replace("&quot;", "\"")
        .replace("&#39;", "'");

    // 步骤5：合并超过 2 个连续空行为 2 个（避免大量空白行）
    let mut result = String::with_capacity(out.len());
    let mut blank_count = 0u32;
    for line in out.split('\n') {
        if line.trim().is_empty() {
            blank_count += 1;
            if blank_count <= 2 {
                result.push('\n');
            }
        } else {
            blank_count = 0;
            result.push_str(line);
            result.push('\n');
        }
    }
    result.trim().to_string()
}


/// HTML 转义（用于把用户文本嵌入到导出 HTML / data URL）
pub(super) fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// 把 HTML 字节序列编码为 data URL（保留常见 ASCII，其它 percent-encode）
#[allow(dead_code)]
pub(super) fn encode_data_url(html: &str) -> String {
    html.as_bytes()
        .iter()
        .map(|&b| match b {
            b'A'..=b'Z'
            | b'a'..=b'z'
            | b'0'..=b'9'
            | b'-'
            | b'_'
            | b'.'
            | b'~'
            | b' '
            | b'!'
            | b'$'
            | b'&'
            | b'('
            | b')'
            | b'*'
            | b'+'
            | b','
            | b';'
            | b'='
            | b'?'
            | b'@'
            | b'/'
            | b':' => (b as char).to_string(),
            _ => format!("%{:02X}", b),
        })
        .collect()
}
