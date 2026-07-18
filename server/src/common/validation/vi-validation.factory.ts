import { BadRequestException, ValidationError } from '@nestjs/common';

/** Vietnamese display labels for known DTO fields (fallback = raw name). */
const FIELD_LABELS: Record<string, string> = {
  email: 'Email',
  password: 'Mật khẩu',
  newPassword: 'Mật khẩu mới',
  code: 'Mã xác thực',
  phone: 'Số điện thoại',
  fullName: 'Họ tên',
  name: 'Tên',
  description: 'Mô tả',
  avatarUrl: 'Ảnh đại diện',
  refreshToken: 'Refresh token',
  idToken: 'Token đăng nhập Google',
  invitedPhone: 'Số điện thoại',
  displayName: 'Tên hiển thị',
  page: 'Trang',
  limit: 'Số bản ghi mỗi trang',
  search: 'Từ khóa',
  familyId: 'Mã gia đình',
  userId: 'Mã người dùng',
  status: 'Trạng thái',
  userType: 'Loại tài khoản',
  accountStatus: 'Trạng thái tài khoản',
  verificationStatus: 'Trạng thái xác minh',
  familyRole: 'Vai trò gia đình',
  relationship: 'Quan hệ',
  activationStatus: 'Trạng thái kích hoạt',
  target: 'Mục backup/restore',
  backupId: 'Mã backup',
  restoreId: 'Mã yêu cầu restore',
  confirmationText: 'Nội dung xác nhận restore',
  auditLogId: 'Mã audit log',
  adminUserId: 'Mã admin',
  action: 'Hành động audit',
  targetType: 'Loại đối tượng audit',
  targetId: 'Mã đối tượng audit',
  result: 'Kết quả audit',
  from: 'Thời gian bắt đầu',
  to: 'Thời gian kết thúc',

  title: 'Tên công việc',
  taskCategoryId: 'Danh mục công việc',
  taskType: 'Loại công việc',
  priority: 'Mức độ ưu tiên',
  dueAt: 'Hạn hoàn thành',
  categoryId: 'Danh mục công việc',
  assignedToMemberId: 'Thành viên được giao',
  assignedByMemberId: 'Thành viên giao việc',
  assignmentId: 'Phân công công việc',
  startAt: 'Thời gian bắt đầu',
  startFrom: 'Thời gian bắt đầu từ',
  startTo: 'Thời gian bắt đầu đến',
  dueFrom: 'Thời gian kết thúc từ',
  dueTo: 'Thời gian kết thúc đến',
  proofs: 'Danh sách minh chứng',
  proofType: 'Loại minh chứng',
  fileUrl: 'Đường dẫn file minh chứng',
  thumbnailUrl: 'Đường dẫn ảnh đại diện minh chứng',
  note: 'Ghi chú',
  submissionNote: 'Ghi chú nộp minh chứng',
  decision: 'Quyết định duyệt',
  reviewNote: 'Ghi chú đánh giá',
  submissionId: 'Minh chứng hoàn thành công việc',
  proofId: 'Minh chứng',

  // SOS / Safety
  sourceType: 'Nguồn',
  severity: 'Mức độ',
  responseType: 'Loại phản hồi',
  message: 'Nội dung',
  resolutionNote: 'Ghi chú xử lý',
  isFalseAlarm: 'Đánh dấu báo động giả',
  initialLatitude: 'Vĩ độ',
  initialLongitude: 'Kinh độ',
  latitude: 'Vĩ độ',
  longitude: 'Kinh độ',
  accuracy: 'Độ chính xác',
  recordedAt: 'Thời điểm ghi nhận',
  deviceId: 'Mã thiết bị',
  alertId: 'Mã cảnh báo',
  unreadOnly: 'Chỉ chưa đọc',

  // Devices
  token: 'Token thiết bị',
  platform: 'Nền tảng',
  deviceName: 'Tên thiết bị',

  // Locations
  isSharing: 'Trạng thái chia sẻ vị trí',

  // SOS settings / emergency contacts
  isEnabled: 'Trạng thái bật SOS',
  notifyAllMembers: 'Chế độ thông báo tất cả thành viên',
  autoCreateAlertFromFall: 'Tự tạo cảnh báo khi té ngã',
  locationRequired: 'Yêu cầu vị trí ban đầu',
  contactName: 'Tên liên hệ',
  phoneNumber: 'Số điện thoại',
  relationshipNote: 'Ghi chú quan hệ',
  priorityOrder: 'Thứ tự ưu tiên',
  isActive: 'Trạng thái kích hoạt',

  // Wearables / sensor events
  deviceType: 'Loại thiết bị',
  deviceIdentifier: 'Mã định danh thiết bị',
  gpsEnabled: 'Trạng thái GPS',
  sosEnabled: 'Trạng thái SOS của thiết bị',
  pairingStatus: 'Trạng thái ghép nối',
  ownerMemberId: 'Thành viên sở hữu',
  eventType: 'Loại sự kiện',
  rawValue: 'Dữ liệu cảm biến',
  detectedAt: 'Thời điểm phát hiện',
};

const PASSWORD_RULE =
  'Mật khẩu phải tối thiểu 8 ký tự, gồm chữ hoa, chữ thường, số và ký tự đặc biệt';

const DOCKER_LOG_QUERY_FIELDS = new Set([
  'tail',
  'timestamps',
  'stdout',
  'stderr',
  'since',
  'until',
]);

/** Builds a Vietnamese message for a single failed constraint. */
function messageFor(property: string, key: string): string {
  const label = FIELD_LABELS[property] ?? property;

  // Password complexity (covers @MinLength + @Matches on password fields).
  if (
    (property === 'password' || property === 'newPassword') &&
    (key === 'matches' || key === 'minLength')
  ) {
    return PASSWORD_RULE;
  }

  // OTP 6 số (verify-email / reset-password).
  if (property === 'code' && key === 'matches') {
    return 'Mã xác thực phải gồm 6 chữ số';
  }

  switch (key) {
    case 'arrayMinSize':
      if (property === 'proofs') {
        return 'Danh sách minh chứng không được để trống';
      }
      return `${label} không được để trống`;
    case 'isArray':
      return `${label} phải là mảng`;
    case 'isEmail':
      return 'Email không hợp lệ';
    case 'isNotEmpty':
      return `${label} không được để trống`;
    case 'isString':
      return `${label} phải là chuỗi ký tự`;
    case 'isInt':
    case 'isNumber':
      return `${label} phải là số`;
    case 'isUrl':
      return `${label} phải là đường dẫn hợp lệ`;
    case 'isEnum':
      return `${label} không hợp lệ`;
    case 'isUuid':
      return `${label} phải là mã định danh hợp lệ`;
    case 'isJwt':
      return `${label} phải là JWT hợp lệ`;
    case 'minLength':
      return `${label} quá ngắn`;
    case 'maxLength':
      return `${label} quá dài`;
    case 'min':
      return `${label} quá nhỏ`;
    case 'max':
      return `${label} quá lớn`;
    case 'matches':
      return `${label} không đúng định dạng`;
    case 'whitelistValidation':
      return `Trường "${property}" không được phép`;
    default:
      return `${label} không hợp lệ`;
  }
}

/**
 * Global ValidationPipe exceptionFactory that turns class-validator failures
 * into a single Vietnamese message. Central source of truth for validation
 * wording — per-DTO English `message:` options are overridden here.
 */
export function viValidationExceptionFactory(
  errors: ValidationError[],
): BadRequestException {
  // Flatten one level of nesting so nested DTOs still produce a message.
  const flat: ValidationError[] = [];
  const walk = (list: ValidationError[]) => {
    for (const e of list) {
      if (e.constraints) flat.push(e);
      if (e.children?.length) walk(e.children);
    }
  };
  walk(errors);

  const first = flat[0];
  const key = first?.constraints
    ? Object.keys(first.constraints)[0]
    : undefined;

  const message =
    first && DOCKER_LOG_QUERY_FIELDS.has(first.property)
      ? 'Tham số lấy log container không hợp lệ.'
      : first && key
        ? messageFor(first.property, key)
        : 'Dữ liệu không hợp lệ';

  return new BadRequestException(message);
}
