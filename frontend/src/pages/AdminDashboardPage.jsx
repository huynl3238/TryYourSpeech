import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  getAdminStats,
  getMentorApplications,
  getMentors,
  reviewMentorApplication,
  revokeMentor,
} from '../services/api';

const STATUS_LABELS = {
  matched: 'Đã ghép',
  active: 'Đang luyện',
  reviewing: 'Đang nhận xét',
  processing: 'Đang chấm AI',
  completed: 'Hoàn thành',
  abandoned: 'Bỏ giữa chừng',
  pending: 'Chờ duyệt',
  published: 'Đã đăng',
  hidden: 'Đã ẩn',
  declined: 'Bị từ chối',
  failed: 'Lỗi',
};

const OPERATION_LABELS = {
  transcription: 'Phiên âm (OpenAI)',
  pronunciation: 'Chấm phát âm (Azure)',
  feedback: 'Nhận xét (OpenAI)',
};

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function formatDate(value) {
  if (!value) return '-';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date);
}

function formatDay(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' }).format(date);
}

function formatDuration(seconds) {
  if (seconds === null || seconds === undefined) return '-';
  const total = Math.round(Number(seconds));
  if (!Number.isFinite(total)) return '-';
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}p ${secs}s`;
}

function formatNumber(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return '0';
  return new Intl.NumberFormat('vi-VN').format(number);
}

function StatCard({ icon, label, value, hint, accent }) {
  return (
    <div className="rounded-2xl border border-[#EAE7E3] bg-white p-4">
      <div className="flex items-center gap-2 text-[#78716C]">
        <span className="material-symbols-rounded" style={{ fontSize: 20, color: accent || '#78716C' }}>
          {icon}
        </span>
        <span className="text-[12.5px] font-semibold">{label}</span>
      </div>
      <div className="mt-2 text-[26px] font-bold leading-none tabular-nums text-[#1C1917]">{value}</div>
      {hint && <div className="mt-1 text-[11.5px] text-[#A8A29E]">{hint}</div>}
    </div>
  );
}

function Panel({ title, subtitle, children, right, className = '' }) {
  return (
    <section className={`rounded-2xl border border-[#EAE7E3] bg-white p-5 ${className}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-[15px] font-bold text-[#1C1917]">{title}</h2>
          {subtitle && <p className="mt-0.5 text-[12px] text-[#A8A29E]">{subtitle}</p>}
        </div>
        {right}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function BarList({ items, accent = '#D97757', emptyText = 'Chưa có dữ liệu' }) {
  if (!items.length) {
    return <p className="text-[13px] text-[#A8A29E]">{emptyText}</p>;
  }
  const max = Math.max(...items.map((item) => item.count), 1);
  return (
    <div className="space-y-2.5">
      {items.map((item) => (
        <div key={item.key} className="flex items-center gap-3">
          <span className="w-36 shrink-0 text-[12.5px] text-[#57534E]">{item.label}</span>
          <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-[#F1EEEA]">
            <div
              className="h-full rounded-md"
              style={{ width: `${(item.count / max) * 100}%`, backgroundColor: accent, minWidth: item.count ? 6 : 0 }}
            />
          </div>
          <span className="w-20 shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-[#1C1917]">
            {item.display ?? item.count}
          </span>
        </div>
      ))}
    </div>
  );
}

// Audio minutes per day for the last two weeks. Kept when the session charts
// were dropped because a spike in consumption is the one thing worth noticing
// the day it happens rather than when the invoice arrives.
function UsageChart({ items }) {
  if (!items.length) {
    return <p className="text-[13px] text-[#A8A29E]">Chưa có lần gọi API nào được ghi nhận.</p>;
  }
  const max = Math.max(...items.map((item) => item.audioMinutes), 0.1);
  return (
    <div className="flex h-32 items-end gap-1.5 overflow-x-auto">
      {items.map((item) => (
        <div key={item.day} className="flex min-w-[26px] flex-1 flex-col items-center gap-1">
          <div
            className="w-full rounded-t-md bg-[#16A34A]"
            style={{ height: `${(item.audioMinutes / max) * 100}%`, minHeight: item.audioMinutes ? 4 : 0 }}
            title={`${item.audioMinutes} phút · ${item.calls} lần gọi`}
          />
          <span className="text-[9.5px] text-[#A8A29E]">{formatDay(item.day)}</span>
        </div>
      ))}
    </div>
  );
}

// One IELTS Speaking test is Part 1 + Part 2 + Part 3, and the seed set gives a
// speaker three answers across them; both people speak, so a finished session
// leaves about six graded turns behind.
const TURNS_PER_SESSION = 6;

function QuotaBar({ used, limit }) {
  if (!limit) {
    return (
      <p className="text-[12.5px] text-[#A8A29E]">
        Không đặt hạn mức tháng. Đã chấm <strong className="tabular-nums">{used}</strong> lượt nói trong tháng này.
      </p>
    );
  }

  const ratio = Math.min(used / limit, 1);
  const nearLimit = ratio >= 0.8;
  // The cap counts turns, and a full test is about six of them. Without this the
  // bar reads as a session count and looks six times roomier than it is.
  const remainingSessions = Math.floor(Math.max(limit - used, 0) / TURNS_PER_SESSION);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-[12.5px] text-[#57534E]">Hạn mức chấm trong tháng</span>
        <span className={`text-[13px] font-bold tabular-nums ${nearLimit ? 'text-[#DC2626]' : 'text-[#1C1917]'}`}>
          {used} / {limit} lượt nói
        </span>
      </div>
      <p className="mt-1 text-[11.5px] text-[#A8A29E]">
        Còn khoảng <strong className="tabular-nums">{remainingSessions}</strong> phiên nữa, tính trung bình{' '}
        {TURNS_PER_SESSION} lượt nói mỗi phiên.
      </p>
      <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-[#F1EEEA]">
        <div
          className="h-full rounded-full"
          style={{ width: `${ratio * 100}%`, backgroundColor: nearLimit ? '#DC2626' : '#16A34A' }}
        />
      </div>
      {nearLimit && (
        <p className="mt-1.5 text-[11.5px] text-[#DC2626]">
          Sắp chạm hạn mức. Khi đầy, các phiên mới sẽ không được chấm cho tới đầu tháng sau.
        </p>
      )}
    </div>
  );
}

// Granting and removing the mentor role. Until this existed both were only
// possible by running npm run db:set-role over SSH on the server.
function MentorAdminPanel() {
  const [applications, setApplications] = useState([]);
  const [mentors, setMentors] = useState([]);
  const [statusFilter, setStatusFilter] = useState('pending');
  const [notes, setNotes] = useState({});
  // Removing the role is one click away from an irreversible-feeling action, so
  // it takes two: opening the confirmation for one mentor, then confirming.
  const [revokingId, setRevokingId] = useState('');
  const [revokeReason, setRevokeReason] = useState('');
  const [busyId, setBusyId] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [applicationData, mentorData] = await Promise.all([
        getMentorApplications(statusFilter),
        getMentors(),
      ]);
      setApplications(applicationData.applications);
      setMentors(mentorData.mentors);
    } catch (err) {
      setError(err.message || 'Không thể tải danh sách đơn');
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleReview(applicationId, decision) {
    setBusyId(applicationId);
    setError('');
    try {
      await reviewMentorApplication({
        applicationId,
        decision,
        reviewNote: notes[applicationId] || '',
      });
      setNotes((current) => ({ ...current, [applicationId]: '' }));
      await load();
    } catch (err) {
      setError(err.message || 'Không xử lý được đơn này');
    } finally {
      setBusyId('');
    }
  }

  function startRevoke(mentor) {
    setError('');
    setRevokingId(mentor.id);
    setRevokeReason('');
  }

  function cancelRevoke() {
    setRevokingId('');
    setRevokeReason('');
  }

  async function handleRevoke(mentor) {
    setBusyId(mentor.id);
    setError('');
    try {
      // The reason reaches the mentor as the body of their notification, so an
      // empty one is allowed but leaves them with only the default sentence.
      await revokeMentor({ userId: mentor.id, reason: revokeReason.trim() });
      cancelRevoke();
      await load();
    } catch (err) {
      setError(err.message || 'Không gỡ được quyền mentor');
    } finally {
      setBusyId('');
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      {/* Two thirds of the row: reading an application means reading a paragraph
          of free text, which a narrow half-width column cramps. */}
      <Panel
        className="lg:col-span-2"
        title="Đơn xin làm mentor"
        subtitle={loading ? 'Đang tải…' : `${applications.length} đơn`}
        right={
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="h-9 rounded-xl border border-[#EAE7E3] bg-white px-2.5 text-[12.5px] font-semibold text-[#57534E]"
          >
            <option value="pending">Chờ duyệt</option>
            <option value="approved">Đã duyệt</option>
            <option value="rejected">Đã từ chối</option>
            <option value="all">Tất cả</option>
          </select>
        }
      >
        {error && (
          <div className="mb-3 rounded-xl border border-[#F0C0B0] bg-[#FBF0EB] px-3.5 py-2.5 text-[13px] text-[#8A4A33]">
            {error}
          </div>
        )}

        {!loading && applications.length === 0 && (
          <p className="text-[13px] text-[#A8A29E]">Không có đơn nào.</p>
        )}

        <div className="space-y-3">
          {applications.map((application) => (
            <div key={application.id} className="rounded-xl border border-[#EAE7E3] p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[15px] font-bold text-[#1C1917]">
                  {application.applicant.displayName}
                </span>
                <span className="rounded-full bg-[#F1EEEA] px-2 py-0.5 text-[11.5px] font-semibold text-[#57534E] tabular-nums">
                  Band {application.applicant.band ?? '-'}
                </span>
                <span className="rounded-full bg-[#F1EEEA] px-2 py-0.5 text-[11.5px] font-semibold text-[#57534E] tabular-nums">
                  {application.applicant.completedSessions} phiên hoàn thành
                </span>
                <span className="text-[11.5px] text-[#A8A29E]">
                  {formatDate(application.createdAt)}
                </span>
              </div>

              {application.applicant.email && (
                <p className="mt-1 text-[12px] text-[#A8A29E]">{application.applicant.email}</p>
              )}

              <p className="mt-2.5 whitespace-pre-wrap text-[14px] leading-relaxed text-[#57534E]">
                {application.message}
              </p>

              {application.status === 'pending' ? (
                <div className="mt-3.5">
                  <input
                    value={notes[application.id] || ''}
                    maxLength={500}
                    onChange={(event) =>
                      setNotes((current) => ({ ...current, [application.id]: event.target.value }))
                    }
                    placeholder="Ghi chú gửi kèm (không bắt buộc khi duyệt, nên có khi từ chối)"
                    className="h-10 w-full rounded-xl border border-[#EAE7E3] px-3 text-[13px] focus:border-[#D97757] focus:outline-none"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === application.id}
                      onClick={() => handleReview(application.id, 'approved')}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#16A34A] px-4 text-[13px] font-semibold text-white hover:brightness-105 disabled:opacity-60"
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: 17 }}>check</span>
                      Duyệt
                    </button>
                    <button
                      type="button"
                      disabled={busyId === application.id}
                      onClick={() => handleReview(application.id, 'rejected')}
                      className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#EAE7E3] px-4 text-[13px] font-semibold text-[#57534E] hover:bg-[#F1EEEA] disabled:opacity-60"
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: 17 }}>close</span>
                      Từ chối
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-2 text-[12.5px] text-[#A8A29E]">
                  {statusLabel(application.status)}
                  {application.reviewer ? ` bởi ${application.reviewer.displayName}` : ''}
                  {application.reviewedAt ? ` · ${formatDate(application.reviewedAt)}` : ''}
                  {application.reviewNote ? ` · ${application.reviewNote}` : ''}
                </p>
              )}
            </div>
          ))}
        </div>
      </Panel>

      <Panel title="Mentor hiện tại" subtitle={`${mentors.length} người`}>
        {mentors.length === 0 && <p className="text-[13px] text-[#A8A29E]">Chưa có mentor nào.</p>}

        <div className="space-y-2.5">
          {mentors.map((mentor) => (
            <div key={mentor.id} className="rounded-xl border border-[#EAE7E3] p-3">
              <p className="text-[13.5px] font-bold text-[#1C1917]">{mentor.displayName}</p>
              <p className="mt-0.5 text-[11.5px] text-[#A8A29E] tabular-nums">
                Band {mentor.band ?? '-'} · {mentor.hostedSessions} buổi đã mở ·{' '}
                {mentor.reviewsWritten} nhận xét
              </p>
              {revokingId === mentor.id ? (
                <div className="mt-2.5 rounded-xl border border-[#FCD9A5] bg-[#FEF6E7] p-2.5">
                  <p className="text-[12.5px] font-semibold text-[#1C1917]">
                    Gỡ quyền mentor của {mentor.displayName}?
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-relaxed text-[#78716C]">
                    Người này quay lại vai trò học viên và không mở được buổi hướng dẫn nữa.
                    Các buổi và nhận xét cũ vẫn được giữ. Bạn có thể duyệt lại đơn để cấp quyền
                    trở lại.
                  </p>
                  <input
                    value={revokeReason}
                    maxLength={500}
                    autoFocus
                    onChange={(event) => setRevokeReason(event.target.value)}
                    placeholder="Lý do gửi cho mentor (không bắt buộc)"
                    className="mt-2 h-9 w-full rounded-lg border border-[#EAE7E3] bg-white px-2.5 text-[12.5px] focus:border-[#D97757] focus:outline-none"
                  />
                  <div className="mt-2 flex items-center gap-2">
                    <button
                      type="button"
                      disabled={busyId === mentor.id}
                      onClick={() => handleRevoke(mentor)}
                      className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[#B91C1C] px-3 text-[12px] font-semibold text-white hover:brightness-110 disabled:opacity-60"
                    >
                      <span className="material-symbols-rounded" style={{ fontSize: 16 }}>person_remove</span>
                      {busyId === mentor.id ? 'Đang gỡ…' : 'Xác nhận gỡ quyền'}
                    </button>
                    <button
                      type="button"
                      disabled={busyId === mentor.id}
                      onClick={cancelRevoke}
                      className="inline-flex h-8 items-center rounded-lg border border-[#EAE7E3] bg-white px-3 text-[12px] font-semibold text-[#57534E] hover:bg-[#F1EEEA] disabled:opacity-60"
                    >
                      Huỷ
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  disabled={busyId === mentor.id}
                  onClick={() => startRevoke(mentor)}
                  className="mt-2 inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#EAE7E3] px-2.5 text-[12px] font-semibold text-[#B91C1C] hover:bg-[#FBF0EB] disabled:opacity-60"
                >
                  <span className="material-symbols-rounded" style={{ fontSize: 16 }}>person_remove</span>
                  Gỡ quyền
                </button>
              )}
            </div>
          ))}
        </div>
      </Panel>
    </div>
  );
}

function AiUsagePanel({ ai }) {
  const { usage, quota } = ai;

  return (
    <Panel
      title="Lượng dùng & chất lượng AI"
      subtitle="Đo bằng chính đơn vị nhà cung cấp tính tiền: phút audio và token, có thể đối chiếu trực tiếp với hoá đơn"
    >
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon="today"
          accent="#16A34A"
          label="Lần gọi API hôm nay"
          value={formatNumber(usage.callsToday)}
          hint={`${usage.audioMinutesToday} phút audio`}
        />
        <StatCard
          icon="calendar_month"
          accent="#16A34A"
          label="Lần gọi API tháng này"
          value={formatNumber(usage.callsMonth)}
          hint={`${usage.sessionsMonth} phiên đã chấm`}
        />
        <StatCard
          icon="graphic_eq"
          label="Phút audio tháng này"
          value={formatNumber(usage.audioMinutesMonth)}
          hint="Tính tiền ở cả OpenAI và Azure"
        />
        <StatCard
          icon="toll"
          label="Token tháng này"
          value={formatNumber(usage.inputTokensMonth + usage.outputTokensMonth)}
          hint={`Vào ${formatNumber(usage.inputTokensMonth)} · ra ${formatNumber(usage.outputTokensMonth)}`}
        />
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-2.5 text-[12.5px] font-semibold text-[#78716C]">
            Số lần gọi theo loại (tháng này)
          </h3>
          <BarList
            accent="#16A34A"
            items={usage.byOperation.map((row) => ({
              key: row.operation,
              label: OPERATION_LABELS[row.operation] || row.operation,
              count: row.calls,
              display: row.operation === 'feedback'
                ? `${formatNumber(row.tokens)} tk`
                : `${row.audioMinutes} ph`,
            }))}
            emptyText="Chưa có lần gọi API nào trong tháng."
          />
          <div className="mt-4">
            <QuotaBar used={quota.used} limit={quota.limit} />
          </div>
        </div>

        <div>
          <h3 className="mb-2.5 text-[12.5px] font-semibold text-[#78716C]">
            Phút audio 14 ngày gần nhất
          </h3>
          <UsageChart items={usage.daily} />
        </div>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {/* The per-session figures are what let you forecast: multiply by the
            number of practices you expect and you have next month's volume. */}
        <div className="rounded-xl bg-[#F7F5F2] px-3 py-2.5">
          <div className="text-[11.5px] text-[#78716C]">Phút audio mỗi phiên</div>
          <div className="text-[18px] font-bold tabular-nums">{usage.audioMinutesPerSession}</div>
          <div className="text-[11px] text-[#A8A29E]">Trung bình tháng này</div>
        </div>
        <div className="rounded-xl bg-[#F7F5F2] px-3 py-2.5">
          <div className="text-[11.5px] text-[#78716C]">Token mỗi phiên</div>
          <div className="text-[18px] font-bold tabular-nums">
            {formatNumber(usage.tokensPerSession)}
          </div>
          <div className="text-[11px] text-[#A8A29E]">Trung bình tháng này</div>
        </div>
        <div className="rounded-xl bg-[#F7F5F2] px-3 py-2.5">
          <div className="text-[11.5px] text-[#78716C]">Đổ vào phiên chấm hỏng</div>
          <div className={`text-[18px] font-bold tabular-nums ${usage.wasted.sessions ? 'text-[#DC2626]' : ''}`}>
            {usage.wasted.audioMinutes} phút
          </div>
          <div className="text-[11px] text-[#A8A29E]">
            {usage.wasted.sessions} phiên · {formatNumber(usage.wasted.tokens)} token
          </div>
        </div>
        <div className="rounded-xl bg-[#F7F5F2] px-3 py-2.5">
          <div className="text-[11.5px] text-[#78716C]">Bài chấm lỗi</div>
          <div className="text-[18px] font-bold tabular-nums">
            {ai.byStatus.find((row) => row.status === 'failed')?.count ?? 0}
          </div>
          <div className="text-[11px] text-[#A8A29E]">Tính cả từ trước</div>
        </div>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-2">
        <div>
          <h3 className="mb-2.5 text-[12.5px] font-semibold text-[#78716C]">Trạng thái chấm (theo bài)</h3>
          <BarList
            accent="#0F62FE"
            items={ai.byStatus.map((row) => ({
              key: row.status,
              label: statusLabel(row.status),
              count: row.count,
            }))}
          />
        </div>
        <div>
          <h3 className="mb-2.5 text-[12.5px] font-semibold text-[#78716C]">Phân bổ band AI chấm</h3>
          <BarList
            accent="#7C3AED"
            items={ai.bandDistribution.map((row) => ({
              key: String(row.band),
              label: `Band ${row.band}`,
              count: row.count,
            }))}
          />
        </div>
      </div>

      {ai.failures.length > 0 && (
        <div className="mt-5">
          <h3 className="mb-2 text-[12.5px] font-semibold text-[#DC2626]">
            Phiên chấm lỗi ({ai.failures.length})
          </h3>
          <div className="overflow-x-auto rounded-xl border border-[#EAE7E3]">
            <table className="w-full min-w-[520px] text-left text-[12.5px]">
              <thead className="bg-[#F7F5F2] text-[#78716C]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Người dùng</th>
                  <th className="px-3 py-2 font-semibold">Lỗi</th>
                  <th className="px-3 py-2 font-semibold">Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {ai.failures.map((row) => (
                  <tr key={`${row.sessionId}-${row.userId}`} className="border-t border-[#EAE7E3]">
                    <td className="px-3 py-2 text-[#1C1917]">{row.displayName}</td>
                    <td className="px-3 py-2 text-[#78716C]">{row.errorMessage || '-'}</td>
                    <td className="whitespace-nowrap px-3 py-2 text-[#A8A29E]">{formatDate(row.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Says out loud where money is not reported, so nobody reads the absence
          of a dollar figure as "this is free". */}
      <p className="mt-5 text-[11px] leading-relaxed text-[#A8A29E]">
        Trang này không quy ra tiền: nhà cung cấp không trả về số tiền cho từng lần gọi, nên mọi con
        số đô-la ở đây sẽ chỉ là ước đoán. Số tiền chính xác xem ở trang hoá đơn của OpenAI và Azure.
        họ cũng tính theo đúng hai đại lượng phía trên.
      </p>
    </Panel>
  );
}

export default function AdminDashboardPage() {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getAdminStats();
      setStats(data);
    } catch (err) {
      setError(err.message || 'Không thể tải thống kê');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="min-h-screen bg-[#FAFAF8] text-[#1C1917]">
      <header className="sticky top-0 z-10 border-b border-[#EAE7E3] bg-[#FAFAF8]/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-2.5">
            <span className="material-symbols-rounded text-[#D97757]" style={{ fontSize: 26 }}>
              admin_panel_settings
            </span>
            <div>
              <h1 className="text-[16px] font-bold leading-tight">Bảng điều khiển quản trị</h1>
              <p className="text-[11.5px] text-[#A8A29E]">
                {stats ? `Cập nhật ${formatDate(stats.generatedAt)}` : 'Đang tải…'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={loading}
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#EAE7E3] bg-white px-3 text-[13px] font-semibold text-[#57534E] hover:bg-[#F1EEEA] disabled:opacity-60"
            >
              <span className="material-symbols-rounded" style={{ fontSize: 18 }}>refresh</span>
              Làm mới
            </button>
            <Link
              to="/"
              className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#EAE7E3] bg-white px-3 text-[13px] font-semibold text-[#57534E] hover:bg-[#F1EEEA]"
            >
              <span className="material-symbols-rounded" style={{ fontSize: 18 }}>home</span>
              Trang chính
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {error && (
          <div className="mb-5 rounded-xl border border-[#F0C0B0] bg-[#FBF0EB] px-4 py-3 text-[13.5px] text-[#8A4A33]">
            {error}
          </div>
        )}

        {loading && !stats && (
          <p className="text-[14px] text-[#78716C]">Đang tải thống kê…</p>
        )}

        {/* Deliberately outside the stats block: granting a mentor role must stay
            possible even on a day when the stats query is what broke. */}
        <div className="mb-6">
          <MentorAdminPanel />
        </div>

        {stats && (
          <div className="space-y-6">
            {/* Realtime */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard
                icon="sensors"
                accent="#16A34A"
                label="Phiên đang luyện"
                value={stats.live?.activeRooms ?? 0}
                hint="Số cặp đang trong phiên"
              />
              <StatCard
                icon="hourglass_top"
                accent="#0F62FE"
                label="Đang chờ ghép"
                value={stats.live?.waitingPeer ?? 0}
              />
              <StatCard
                icon="school"
                accent="#0F62FE"
                label="Phiên luyện mentor đang chờ"
                value={stats.live?.waitingMentor ?? 0}
              />
            </div>

            {/* Overview KPIs */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <StatCard icon="group" label="Tổng người dùng" value={stats.overview.totalUsers} />
              <StatCard icon="cast_for_education" label="Tổng mentor" value={stats.overview.mentorCount} />
              <StatCard icon="forum" label="Phiên hôm nay" value={stats.overview.sessionsToday} />
              <StatCard
                icon="task_alt"
                accent="#16A34A"
                label="Phiên hoàn thành"
                value={stats.overview.completedSessions}
                hint={`${stats.overview.completionRate}% số phiên đã kết thúc`}
              />
              <StatCard
                icon="cancel"
                accent="#DC2626"
                label="Bỏ giữa chừng"
                value={stats.overview.abandonedSessions}
              />
              <StatCard
                icon="timer"
                label="Thời lượng TB/phiên xong"
                value={formatDuration(stats.overview.avgSessionSeconds)}
              />
            </div>

            <AiUsagePanel ai={stats.ai} />

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Phân bổ trình độ (band)">
                <BarList
                  accent="#0891B2"
                  items={stats.userBands.map((row) => ({
                    key: String(row.band),
                    label: `Band ${row.band}`,
                    count: row.count,
                  }))}
                  emptyText="Chưa có người dùng nào đặt band."
                />
              </Panel>

              <Panel title="Sức khỏe hệ thống">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-[#F7F5F2] px-3 py-2.5">
                    <div className="text-[11.5px] text-[#78716C]">Audio upload lỗi</div>
                    <div className={`text-[18px] font-bold tabular-nums ${stats.system.failedUploads ? 'text-[#DC2626]' : ''}`}>
                      {stats.system.failedUploads}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#F7F5F2] px-3 py-2.5">
                    <div className="text-[11.5px] text-[#78716C]">Upload đang chờ</div>
                    <div className="text-[18px] font-bold tabular-nums">{stats.system.pendingUploads}</div>
                  </div>
                  <div className="rounded-xl bg-[#F7F5F2] px-3 py-2.5">
                    <div className="text-[11.5px] text-[#78716C]">Lượt nói chấm lỗi</div>
                    <div className={`text-[18px] font-bold tabular-nums ${stats.system.failedTurnResults ? 'text-[#DC2626]' : ''}`}>
                      {stats.system.failedTurnResults}
                    </div>
                  </div>
                  {/* A session stuck in 'processing' is a user watching a spinner
                      that will never resolve on its own. */}
                  <div className="rounded-xl bg-[#F7F5F2] px-3 py-2.5">
                    <div className="text-[11.5px] text-[#78716C]">Phiên kẹt khi chấm</div>
                    <div className={`text-[18px] font-bold tabular-nums ${stats.system.stuckProcessing ? 'text-[#DC2626]' : ''}`}>
                      {stats.system.stuckProcessing}
                    </div>
                    <div className="text-[11px] text-[#A8A29E]">Quá 10 phút chưa xong</div>
                  </div>
                </div>
              </Panel>
            </div>

            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Lớp học">
                <div className="rounded-xl bg-[#F7F5F2] px-3 py-2.5">
                  <div className="text-[11.5px] text-[#78716C]">Bài đang chờ duyệt</div>
                  <div className={`text-[18px] font-bold tabular-nums ${stats.content.pendingPosts ? 'text-[#D97757]' : ''}`}>
                    {stats.content.pendingPosts}
                  </div>
                </div>
              </Panel>

              <Panel title="Bộ câu hỏi">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-[#F7F5F2] px-3 py-2.5">
                    <div className="text-[11.5px] text-[#78716C]">Của hệ thống</div>
                    <div className="text-[18px] font-bold tabular-nums">
                      {stats.content.systemQuestionSets}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#F7F5F2] px-3 py-2.5">
                    <div className="text-[11.5px] text-[#78716C]">Của mentor</div>
                    <div className="text-[18px] font-bold tabular-nums">
                      {stats.content.mentorQuestionSets}
                    </div>
                  </div>
                </div>
              </Panel>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
