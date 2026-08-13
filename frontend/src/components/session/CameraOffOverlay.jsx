// Thẻ <video> KHÔNG tự xoá khung hình cuối khi mất nguồn ảnh: tháo track ra khỏi
// stream, hay ngừng nhận gói RTP từ đối tác, thì nó cứ giữ nguyên khung đang hiển
// thị. Nên tắt camera trông như hình bị treo chứ không phải màn hình đen — người
// còn lại tưởng mạng lỗi. Lớp phủ này che hẳn khung đóng băng đó lại.
//
// Là phần tử đứng cạnh <video> bên trong khung sẵn có (đều `position: relative`),
// không bọc quanh <video>: mọi quy tắc CSS hiện có đều viết theo dạng
// `.khung video`, bọc thêm một lớp nữa là chúng vẫn khớp nhưng khung nhỏ tự xem
// lại thì bị lệch. Đứng cạnh cũng tránh bị lật ngược theo `transform: scaleX(-1)`
// của khung tự xem.
export function CameraOffOverlay({ label, compact = false }) {
  return (
    <div className={`camera-off-overlay ${compact ? 'compact' : ''}`}>
      <span className="material-symbols-rounded">videocam_off</span>
      {!compact && label ? <p>{label}</p> : null}
    </div>
  );
}
