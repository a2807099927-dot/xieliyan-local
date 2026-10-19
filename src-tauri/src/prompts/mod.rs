// Prompt 加密存储模块
// 所有 AI 提示词在编译时经过 XOR 加密存储，运行时解密返回
// 防止通过 strings 命令直接提取中文提示词

mod encrypted;
pub mod registry;

/// XOR 解密函数
pub fn xor_decrypt(data: &[u8], key: &[u8]) -> String {
    let decrypted: Vec<u8> = data.iter().enumerate().map(|(i, b)| b ^ key[i % key.len()]).collect();
    String::from_utf8_lossy(&decrypted).to_string()
}
