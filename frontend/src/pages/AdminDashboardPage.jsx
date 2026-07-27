import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { getAdminStats } from '../services/api';

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

function statusLabel(status) {
  return STATUS_LABELS[status] || status;
}

function formatDate(value) {
  if (!value) return '—';
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
  if (seconds === null || seconds === undefined) return '—';
  const total = Math.round(Number(seconds));
  if (!Number.isFinite(total)) return '—';
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}p ${secs}s`;
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

function Panel({ title, subtitle, children, right }) {
  return (
    <section className="rounded-2xl border border-[#EAE7E3] bg-white p-5">
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
          <span className="w-28 shrink-0 text-[12.5px] text-[#57534E]">{item.label}</span>
          <div className="relative h-5 flex-1 overflow-hidden rounded-md bg-[#F1EEEA]">
            <div
              className="h-full rounded-md"
              style={{ width: `${(item.count / max) * 100}%`, backgroundColor: accent, minWidth: item.count ? 6 : 0 }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-[12.5px] font-semibold tabular-nums text-[#1C1917]">
            {item.count}
          </span>
        </div>
      ))}
    </div>
  );
}

function DayChart({ items }) {
  if (!items.length) {
    return <p className="text-[13px] text-[#A8A29E]">Chưa có phiên nào trong 14 ngày qua.</p>;
  }
  const max = Math.max(...items.map((item) => item.count), 1);
  return (
    <div className="flex h-40 items-end gap-1.5 overflow-x-auto">
      {items.map((item) => (
        <div key={item.day} className="flex min-w-[26px] flex-1 flex-col items-center gap-1">
          <span className="text-[10px] font-semibold tabular-nums text-[#78716C]">{item.count || ''}</span>
          <div
            className="w-full rounded-t-md bg-[#D97757]"
            style={{ height: `${(item.count / max) * 100}%`, minHeight: item.count ? 4 : 0 }}
            title={`${item.count} phiên`}
          />
          <span className="text-[9.5px] text-[#A8A29E]">{formatDay(item.day)}</span>
        </div>
      ))}
    </div>
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

        {stats && (
          <div className="space-y-6">
            {/* Realtime */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-3">
              <StatCard
                icon="sensors"
                accent="#16A34A"
                label="Phòng đang luyện"
                value={stats.live?.activeRooms ?? 0}
                hint="Số cặp đang trong phiên"
              />
              <StatCard
                icon="hourglass_top"
                accent="#0F62FE"
                label="Đang chờ ghép (peer)"
                value={stats.live?.waitingPeer ?? 0}
              />
              <StatCard
                icon="school"
                accent="#0F62FE"
                label="Đang chờ (mentor)"
                value={stats.live?.waitingMentor ?? 0}
              />
            </div>

            {/* Overview KPIs */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              <StatCard icon="group" label="Người dùng" value={stats.overview.totalUsers}
                hint={`+${stats.overview.newUsers7d} trong 7 ngày`} />
              <StatCard icon="cast_for_education" label="Mentor" value={stats.overview.mentorCount} />
              <StatCard icon="forum" label="Tổng phiên" value={stats.overview.totalSessions}
                hint={`Hôm nay: ${stats.overview.sessionsToday}`} />
              <StatCard icon="task_alt" accent="#16A34A" label="Tỉ lệ hoàn thành"
                value={`${stats.overview.completionRate}%`}
                hint={`${stats.overview.completedSessions} hoàn thành`} />
              <StatCard icon="cancel" accent="#DC2626" label="Bỏ giữa chừng"
                value={stats.overview.abandonedSessions} />
              <StatCard icon="timer" label="Thời lượng TB/phiên"
                value={formatDuration(stats.overview.avgSessionSeconds)} />
              <StatCard icon="hub" label="Peer / Mentor"
                value={`${stats.overview.peerSessions} / ${stats.overview.mentorSessions}`} />
              <StatCard icon="graphic_eq" label="Phút audio đã xử lý"
                value={stats.ai.totalAudioMinutes}
                hint={`${stats.ai.uploadedTurns} lượt nói`} />
            </div>

            {/* Activity */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Phiên luyện tập theo ngày" subtitle="14 ngày gần nhất">
                <DayChart items={stats.sessionsPerDay} />
              </Panel>
              <Panel title="Phiên theo trạng thái">
                <BarList
                  items={stats.sessionsByStatus.map((row) => ({
                    key: row.status,
                    label: statusLabel(row.status),
                    count: row.count,
                  }))}
                />
              </Panel>
            </div>

            {/* AI quality */}
            <Panel
              title="Chất lượng & chi phí AI"
              subtitle="Theo dõi để phát hiện lỗi chấm và ước lượng khối lượng xử lý"
            >
              <div className="grid gap-5 lg:grid-cols-2">
                <div>
                  <h3 className="mb-2.5 text-[12.5px] font-semibold text-[#78716C]">Trạng thái chấm (theo bài)</h3>
                  <BarList
                    accent="#0F62FE"
                    items={stats.ai.byStatus.map((row) => ({
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
                    items={stats.ai.bandDistribution.map((row) => ({
                      key: String(row.band),
                      label: `Band ${row.band}`,
                      count: row.count,
                    }))}
                  />
                </div>
              </div>

              {stats.ai.failures.length > 0 && (
                <div className="mt-5">
                  <h3 className="mb-2 text-[12.5px] font-semibold text-[#DC2626]">
                    Phiên chấm lỗi ({stats.ai.failures.length})
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
                        {stats.ai.failures.map((row) => (
                          <tr key={`${row.sessionId}-${row.userId}`} className="border-t border-[#EAE7E3]">
                            <td className="px-3 py-2 text-[#1C1917]">{row.displayName}</td>
                            <td className="px-3 py-2 text-[#78716C]">{row.errorMessage || '—'}</td>
                            <td className="whitespace-nowrap px-3 py-2 text-[#A8A29E]">{formatDate(row.updatedAt)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </Panel>

            {/* Content moderation */}
            <div className="grid gap-4 lg:grid-cols-2">
              <Panel title="Kiểm duyệt Lớp học">
                <div className="grid grid-cols-2 gap-3">
                  {stats.content.classroomByStatus.length === 0 && (
                    <p className="col-span-2 text-[13px] text-[#A8A29E]">Chưa có bài nào.</p>
                  )}
                  {stats.content.classroomByStatus.map((row) => (
                    <div key={row.status} className="rounded-xl bg-[#F7F5F2] px-3 py-2.5">
                      <div className="text-[11.5px] text-[#78716C]">{statusLabel(row.status)}</div>
                      <div className="text-[18px] font-bold tabular-nums">{row.count}</div>
                    </div>
                  ))}
                </div>
                {stats.content.pendingPosts.length > 0 && (
                  <div className="mt-4">
                    <h3 className="mb-2 text-[12.5px] font-semibold text-[#D97757]">
                      Bài chờ duyệt ({stats.content.pendingPosts.length})
                    </h3>
                    <ul className="space-y-1.5">
                      {stats.content.pendingPosts.map((post) => (
                        <li key={post.id} className="flex items-center justify-between gap-3 rounded-lg border border-[#EAE7E3] px-3 py-2">
                          <div className="min-w-0">
                            <div className="truncate text-[13px] font-medium">{post.title}</div>
                            <div className="text-[11px] text-[#A8A29E]">{post.author} · {formatDate(post.createdAt)}</div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </Panel>

              <Panel title="Nội dung & bộ câu hỏi">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-[#F7F5F2] px-3 py-2.5">
                    <div className="text-[11.5px] text-[#78716C]">Chủ đề</div>
                    <div className="text-[18px] font-bold tabular-nums">{stats.content.totalTopics}</div>
                    <div className="text-[11px] text-[#A8A29E]">
                      Hệ thống {stats.content.systemTopics} · Mentor {stats.content.mentorTopics}
                    </div>
                  </div>
                  <div className="rounded-xl bg-[#F7F5F2] px-3 py-2.5">
                    <div className="text-[11.5px] text-[#78716C]">Câu hỏi</div>
                    <div className="text-[18px] font-bold tabular-nums">{stats.content.totalQuestions}</div>
                  </div>
                </div>
              </Panel>
            </div>

            {/* Users + system health */}
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
                    <div className="text-[11.5px] text-[#78716C]">Phiên mentor đang mở</div>
                    <div className="text-[18px] font-bold tabular-nums">{stats.system.openMentorSessions}</div>
                  </div>
                  <div className="rounded-xl bg-[#F7F5F2] px-3 py-2.5">
                    <div className="text-[11.5px] text-[#78716C]">Lượt nói chấm lỗi</div>
                    <div className={`text-[18px] font-bold tabular-nums ${stats.ai.failedTurnResults ? 'text-[#DC2626]' : ''}`}>
                      {stats.ai.failedTurnResults}
                    </div>
                  </div>
                </div>
              </Panel>
            </div>

            <p className="pb-4 text-center text-[11.5px] text-[#C4BEB6]">
              Trang này chưa có phân quyền — chỉ dùng để xem trước.
            </p>
          </div>
        )}
      </main>
    </div>
  );
}
