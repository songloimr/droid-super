# droid-shunt Evals Suite

Bộ đánh giá (evals suite) chạy lại được cho plugin `droid-shunt`, thực hiện trên corpus và codebase thực tế (`9router-next`).

## Cấu trúc thư mục

```
evals/
├── README.md               # Tài liệu hướng dẫn, cấu hình, cách chạy
├── hooks/                  # Lớp 1: Đánh giá hooks PreToolUse offline (Read & Execute/Bash)
│   ├── gen-corpus.mjs      # Sinh corpus JSONL kiểm thử từ repo thực tế
│   ├── corpus.jsonl        # Corpus test cases kèm expected decision & metadata
│   └── run.mjs             # Harness thực thi hooks, đo độ chính xác & latency
├── delegation/             # Lớp 2: Đánh giá chất lượng delegate (bulk-reader & code-writer)
│   ├── questions.json      # Danh mục tác vụ delegate (deterministic + LLM rubric)
│   ├── gen-ground-truth.mjs# Sinh ground truth từ codebase 9router-next
│   ├── ground-truth.json   # Ground truth cho deterministic questions
│   ├── run.mjs             # Chạy delegation qua Task tool / model
│   └── grade.mjs           # Chấm điểm độ chính xác câu trả lời & code sinh ra
├── e2e/                    # Lớp 3: Tác vụ End-to-End A/B (Baseline vs Shunt)
│   ├── tasks.json          # 20 tác vụ chuẩn hóa (delegate-yes, delegate-no, small, mixed)
│   ├── run.sh              # Orchestrator chạy 120 phiên đo (3 runs × 2 configs × 20 tasks)
│   └── grade.mjs           # Chấm điểm hành vi delegate, task success, tổng hợp tokens/cost
├── results/                # Lưu trữ kết quả đo JSON thô và báo cáo tổng hợp
│   ├── hooks-latest.json
│   ├── delegation-latest.json
│   ├── e2e-latest.json
│   └── BENCHMARK-9router-next.md
└── scratch/                # Thư mục tạm cho code-writer sinh code (không ghi vào repo mục tiêu)
```

## Các biến môi trường

- `SHUNT_MIN_LINES`: Ngưỡng dòng kích hoạt shunt (mặc định: `350`).
- `PARENT_MODEL`: Model cha sử dụng cho e2e và judge (mặc định: `custom:Mimo-V2.6-Pro-0`).
- `DROID_MODEL`: Model subagent cho droid `bulk-reader`/`code-writer` (mặc định: `custom:gemini-3.7-flash-high-0`).
- `EVAL_CONCURRENCY`: Số phiên chạy đồng thời trong e2e runner (mặc định: `4`).
- `EVAL_TARGET`: Target codebase cần đánh giá (`9router-next` mặc định, hoặc `express-master`).
- `TARGET_REPO`: Đường dẫn repo mục tiêu (mặc định được phân giải tự động bởi `evals/targets.mjs`).
- `EVAL_RUNS`: Số lần lặp lại cho mỗi tác vụ e2e (mặc định: `3`; đặt `1` cho batch 40 phiên).

## Đánh giá đa mục tiêu (Multi-Target Benchmark)

Bộ harness hỗ trợ chuyển đổi linh hoạt qua biến môi trường `EVAL_TARGET`:
- **Target `9router-next` (mặc định):** Giữ nguyên toàn bộ cấu trúc file và kết quả lịch sử tại `evals/results/`.
- **Target `express-master` (hoặc target mới):** Toàn bộ kết quả và session logs được lưu trữ cách ly tại `evals/results/<target>/` để tránh trộn lẫn dữ liệu.

### Cơ chế cách ly Baseline (True Isolation)
- Trong Pha B (Baseline), harness thực hiện gỡ cài đặt (`droid plugin uninstall droid-shunt@droid-super --scope user`) để đảm bảo không bị rò rỉ hook PreToolUse.
- Trong Pha A (Shunt), plugin được cài đặt lại (`droid plugin install droid-shunt@droid-super --scope user`).
- Cơ chế `trap` trong `run.sh` đảm bảo plugin luôn được khôi phục về trạng thái đã cài đặt khi runner kết thúc hoặc bị gián đoạn.

### Kiểm tra tính toàn vẹn (Safety Invariant)
- Với Git repo (như `9router-next`), runner kiểm tra `git status --short --branch` sau mỗi phiên.
- Với thư mục nguồn không phải Git repo (như `express-master`), runner tự động sinh manifest sha256 toàn bộ file và đối chiếu checksum sau mỗi phiên để đảm bảo nguyên tắc chỉ đọc.

## Cách chạy từng lớp

### 1. Lớp 1: Hooks Offline Benchmark
Kiểm tra độ chính xác (Precision, Recall, F1), ma trận nhầm lẫn và độ trễ (latency median/p95) của các script hook `check-file-size` và `check-bash-read`:

```bash
# Tự kiểm tra & sinh corpus
node evals/hooks/gen-corpus.mjs

# Chạy harness đo đạc
node evals/hooks/run.mjs --self-check
```

### 2. Lớp 2: Delegation Quality Benchmark
Đo độ chính xác trích xuất thông tin của `bulk-reader` và tính hợp lệ code của `code-writer`:

> **Lưu ý về `code-writer`:** Droid `code-writer` mặc định được ship ở trạng thái tắt (`droids/code-writer.md.disabled`). Runner `evals/delegation/run.mjs` đã tích hợp cơ chế tự động phân giải fallback sang file `.disabled`, do đó có thể chạy kiểm thử bình thường mà không cần bật toggle thủ công trước.

```bash
# Sinh ground truth từ codebase
node evals/delegation/gen-ground-truth.mjs

# Thực thi và chấm điểm
node evals/delegation/run.mjs
node evals/delegation/grade.mjs
```

### 3. Lớp 3: End-to-End A/B Benchmark
Chạy so sánh A/B (Pha B: Baseline không plugin, Pha A: Shunt bật plugin) trên 20 tác vụ đại diện:

```bash
# Chạy smoke test 2 phiên kiểm tra harness
bash evals/e2e/run.sh --smoke

# Chạy toàn bộ 120 phiên
bash evals/e2e/run.sh --all

# Chấm điểm và tổng hợp kết quả
node evals/e2e/grade.mjs
```

## Nguyên tắc an toàn
- Toàn bộ quá trình chạy e2e chỉ đọc từ `TARGET_REPO`.
- Tuyệt đối không ghi, sửa hay xóa file trong `TARGET_REPO`.
- Tất cả output tạo file từ `code-writer` được điều hướng về `evals/scratch/`.
