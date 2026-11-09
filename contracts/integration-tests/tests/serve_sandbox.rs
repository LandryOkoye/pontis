//! Keeps a local NEAR sandbox running for the script-driven end-to-end run (`tests/e2e`).
//! Ignored by default: `tests/e2e` starts it, reads the connection details from the file named
//! by `PONTIS_SANDBOX_INFO`, and stops it when the run ends.

use serde_json::json;

#[tokio::test]
#[ignore = "started on purpose by tests/e2e"]
async fn serve_sandbox() -> anyhow::Result<()> {
    let path = std::env::var("PONTIS_SANDBOX_INFO")
        .map_err(|_| anyhow::anyhow!("PONTIS_SANDBOX_INFO must name the file to write"))?;
    let worker = near_workspaces::sandbox().await?;
    let root = worker.root_account()?;
    // The root account of a throwaway local chain: not a secret that matters.
    let info = json!({
        "rpcUrl": worker.rpc_addr(),
        "accountId": root.id().to_string(),
        "secretKey": root.secret_key().to_string(),
    });
    // Written last and atomically, so a reader never sees a half-written file.
    let tmp = format!("{path}.tmp");
    std::fs::write(&tmp, info.to_string())?;
    std::fs::rename(&tmp, &path)?;
    std::future::pending::<()>().await;
    Ok(())
}
