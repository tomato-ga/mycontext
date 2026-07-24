# Incident: author-style chapter map drift

## Observed state

- Notion page: `3a5625fe-b1a2-81cb-9698-e5a1c8213ce2`
- Document ID: `ore-body-style`
- Workflow: `Ready -> Syncing -> Error`
- Error code: `author_style_validation_failed`
- Error message: `expected H3 delivery sections under 22. 参照データ`
- Active revision before the failed sync: `863c155e655f35d9c3b0a0d8ea812f633f199cb5559e6c39d6d2385b5582d788`
- Source Markdown SHA-256: `7ae2e989e5d89cc0e4bb5f683ac6ce98887491d369890e07deaca7d8623d46d0`
- Original run ID / event ID: Unknown. The persistent state log did not exist when this failure occurred.

## Root cause

Notionの正本は、21章を長文記事ルール、22章を参照データへ変更していた。同期parserは旧配置のまま、22章をH3 delivery群、21章を参照データとして決め打ちしていた。そのため正しい22章を検証エラーにした。

## Harness changes

1. 21章のH3を長文delivery、22章のH2を参照データとして解析する回帰テストを追加した。
2. 解析結果が変わったことをrevisionへ反映するため、parser versionを`author-style-parser-v2`へ更新した。
3. 各Queue deliveryを`context_sync_state_log`へ追記し、入力ハッシュ、parser version、状態遷移、失敗コード、次の操作を残すようにした。
4. `failed`または`dead_lettered`の修正には、失敗入力の回帰テストを必須とする契約を追加した。

## Verification evidence

- Successful run ID: `3337355289818fb97075ae2c82fbd2efc448f6eef753a7ddaf60ee1aa21455d6`
- States: `received -> eligible -> syncing -> source_verified -> content_validated -> persisted -> synced`
- Candidate revision: `2d42b86a75b567f96e35e7c475f7cff0ea7afe614ca2d96717b346ffdb972ebf`
- Parsed sections: 79
- Duplicate-input run ID: `9960904f7ecfcd8299a5f560fb55b36070cd413704768a299db71ea7fc7367a2`
- Duplicate-input terminal state: `skipped`
- Final Notion Status: `Synced`
- Final Validation Error: empty

## Reopen condition

同じerror codeとparser versionの組み合わせが本番ログに再出現した場合、または21章の`ore-body/longform/contract`と22章の`ore-body/ops/references`を回帰テストが生成できなくなった場合は、このインシデントを再発として扱う。
