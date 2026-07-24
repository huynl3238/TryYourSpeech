INSERT INTO topics (id, name, owner_id)
VALUES
  ('11111111-1111-4111-8111-111111111111', 'Education', NULL),
  ('11111111-1111-4111-8111-111111111112', 'Technology', NULL),
  ('11111111-1111-4111-8111-111111111113', 'Drinks & Monuments', NULL)
ON CONFLICT (id) DO UPDATE
SET name = EXCLUDED.name;

INSERT INTO questions (id, topic_id, part_number, question_text, cue_card, suggested_phrases)
VALUES
  (
    '22222222-2222-4222-8222-222222222201',
    '11111111-1111-4111-8111-111111111111',
    1,
    'Do you work or study?',
    NULL,
    '["I am currently studying...", "My major is...", "What I enjoy most is...", "It can be quite demanding because...", "In the future, I hope to..."]'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222202',
    '11111111-1111-4111-8111-111111111111',
    1,
    'What subject did you enjoy most at school?',
    NULL,
    '["I was particularly interested in...", "The reason I liked it was...", "It helped me develop...", "I found it both challenging and rewarding", "Compared with other subjects..."]'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222203',
    '11111111-1111-4111-8111-111111111111',
    1,
    'Do you prefer studying alone or with other people?',
    NULL,
    '["I tend to prefer...", "It depends on the task", "Studying with others helps me...", "When I study alone, I can...", "A balanced approach works best for me"]'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222204',
    '11111111-1111-4111-8111-111111111111',
    1,
    'How do you usually prepare for an important exam?',
    NULL,
    '["I usually make a study plan", "I break the content into smaller sections", "I revise regularly instead of cramming", "Practice tests are extremely useful", "I try to stay calm and focused"]'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222205',
    '11111111-1111-4111-8111-111111111111',
    2,
    'Describe a teacher who had an important influence on you.',
    '{"prompt":"Describe a teacher who had an important influence on you.","bullet_points":["who this teacher was","what subject they taught","what you learned from them","and explain why this teacher influenced you."]}'::jsonb,
    '["One teacher who really influenced me was...", "What made him/her stand out was...", "He/She encouraged me to...", "I used to struggle with...", "Thanks to that teacher, I became more confident"]'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222206',
    '11111111-1111-4111-8111-111111111111',
    3,
    'What qualities make someone a good teacher?',
    NULL,
    '["From my perspective...", "A good teacher should be patient and approachable", "Another important quality is...", "It is not only about knowledge, but also about...", "This can have a long-term impact on students"]'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222207',
    '11111111-1111-4111-8111-111111111111',
    3,
    'How has technology changed education in recent years?',
    NULL,
    '["Technology has transformed the way people learn", "Students now have access to...", "One major advantage is...", "However, there are also some drawbacks", "In the long run, I think..."]'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222208',
    '11111111-1111-4111-8111-111111111111',
    3,
    'Do you think online learning can replace traditional classrooms?',
    NULL,
    '["I do not think it can completely replace...", "Online learning is convenient because...", "Traditional classrooms offer...", "Face-to-face interaction is still important", "A hybrid model may be the best solution"]'::jsonb
  )
ON CONFLICT (id) DO UPDATE
SET suggested_phrases = EXCLUDED.suggested_phrases;

INSERT INTO users (id, display_name, band, user_role, created_at)
VALUES
  ('1ebb7a00-5352-4508-9947-258fc3d35bbc', 'Nguyễn Lê Huy', 6.5, 'student', NOW() - INTERVAL '14 days'),
  ('33333333-3333-4333-8333-333333333302', 'Trần Minh Anh', 6.0, 'student', NOW() - INTERVAL '13 days'),
  ('33333333-3333-4333-8333-333333333303', 'Mentor Linh Nguyễn', NULL, 'mentor', NOW() - INTERVAL '12 days'),
  ('33333333-3333-4333-8333-333333333304', 'Phạm Thu Trang', 7.0, 'student', NOW() - INTERVAL '11 days'),
  ('33333333-3333-4333-8333-333333333305', 'Admin Try Your Speech', NULL, 'admin', NOW() - INTERVAL '10 days')
ON CONFLICT (id) DO UPDATE
SET
  display_name = EXCLUDED.display_name,
  band = EXCLUDED.band,
  user_role = EXCLUDED.user_role;

INSERT INTO sessions (
  id,
  room_id,
  user_a_id,
  user_b_id,
  topic_id,
  session_mode,
  status,
  user_a_review_done_at,
  user_b_review_done_at,
  started_at,
  ended_at,
  created_at
)
VALUES
  (
    '44444444-4444-4444-8444-444444444401',
    'seed-peer-room-education',
    '1ebb7a00-5352-4508-9947-258fc3d35bbc',
    '33333333-3333-4333-8333-333333333302',
    '11111111-1111-4111-8111-111111111111',
    'peer',
    'completed',
    NOW() - INTERVAL '6 days',
    NOW() - INTERVAL '6 days',
    NOW() - INTERVAL '6 days 40 minutes',
    NOW() - INTERVAL '6 days',
    NOW() - INTERVAL '6 days 45 minutes'
  ),
  (
    '44444444-4444-4444-8444-444444444402',
    'seed-mentor-room-education',
    '1ebb7a00-5352-4508-9947-258fc3d35bbc',
    '33333333-3333-4333-8333-333333333303',
    '11111111-1111-4111-8111-111111111111',
    'mentor',
    'completed',
    NULL,
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days 35 minutes',
    NOW() - INTERVAL '2 days',
    NOW() - INTERVAL '2 days 40 minutes'
  ),
  (
    '44444444-4444-4444-8444-444444444403',
    'seed-peer-room-active',
    '33333333-3333-4333-8333-333333333304',
    '33333333-3333-4333-8333-333333333302',
    '11111111-1111-4111-8111-111111111111',
    'peer',
    'reviewing',
    NOW() - INTERVAL '1 day',
    NULL,
    NOW() - INTERVAL '1 day 30 minutes',
    NULL,
    NOW() - INTERVAL '1 day 35 minutes'
  )
ON CONFLICT (id) DO UPDATE
SET
  status = EXCLUDED.status,
  user_a_review_done_at = EXCLUDED.user_a_review_done_at,
  user_b_review_done_at = EXCLUDED.user_b_review_done_at,
  ended_at = EXCLUDED.ended_at;

INSERT INTO turns (
  id,
  session_id,
  speaker_id,
  speaker_role,
  question_id,
  part_number,
  turn_index,
  duration_ms,
  prep_duration_ms,
  audio_url,
  upload_status,
  created_at
)
VALUES
  ('55555555-5555-4555-8555-555555555401', '44444444-4444-4444-8444-444444444401', '1ebb7a00-5352-4508-9947-258fc3d35bbc', 'A', '22222222-2222-4222-8222-222222222201', 1, 1, 45000, 0, '/uploads/audio/seed-huy-part1.webm', 'uploaded', NOW() - INTERVAL '6 days 39 minutes'),
  ('55555555-5555-4555-8555-555555555402', '44444444-4444-4444-8444-444444444401', '33333333-3333-4333-8333-333333333302', 'B', '22222222-2222-4222-8222-222222222201', 1, 2, 45000, 0, '/uploads/audio/seed-anh-part1.webm', 'uploaded', NOW() - INTERVAL '6 days 38 minutes'),
  ('55555555-5555-4555-8555-555555555403', '44444444-4444-4444-8444-444444444401', '1ebb7a00-5352-4508-9947-258fc3d35bbc', 'A', '22222222-2222-4222-8222-222222222205', 2, 3, 120000, 60000, '/uploads/audio/seed-huy-part2.webm', 'uploaded', NOW() - INTERVAL '6 days 35 minutes'),
  ('55555555-5555-4555-8555-555555555404', '44444444-4444-4444-8444-444444444401', '33333333-3333-4333-8333-333333333302', 'B', '22222222-2222-4222-8222-222222222205', 2, 4, 120000, 60000, '/uploads/audio/seed-anh-part2.webm', 'uploaded', NOW() - INTERVAL '6 days 32 minutes'),
  ('55555555-5555-4555-8555-555555555405', '44444444-4444-4444-8444-444444444401', '1ebb7a00-5352-4508-9947-258fc3d35bbc', 'A', '22222222-2222-4222-8222-222222222206', 3, 5, 60000, 0, '/uploads/audio/seed-huy-part3.webm', 'uploaded', NOW() - INTERVAL '6 days 29 minutes'),
  ('55555555-5555-4555-8555-555555555406', '44444444-4444-4444-8444-444444444401', '33333333-3333-4333-8333-333333333302', 'B', '22222222-2222-4222-8222-222222222206', 3, 6, 60000, 0, '/uploads/audio/seed-anh-part3.webm', 'uploaded', NOW() - INTERVAL '6 days 27 minutes'),
  ('55555555-5555-4555-8555-555555555411', '44444444-4444-4444-8444-444444444402', '1ebb7a00-5352-4508-9947-258fc3d35bbc', 'A', '22222222-2222-4222-8222-222222222201', 1, 1, 45000, 0, NULL, 'pending', NOW() - INTERVAL '2 days 34 minutes'),
  ('55555555-5555-4555-8555-555555555412', '44444444-4444-4444-8444-444444444402', '1ebb7a00-5352-4508-9947-258fc3d35bbc', 'A', '22222222-2222-4222-8222-222222222205', 2, 2, 120000, 60000, NULL, 'pending', NOW() - INTERVAL '2 days 31 minutes'),
  ('55555555-5555-4555-8555-555555555413', '44444444-4444-4444-8444-444444444402', '1ebb7a00-5352-4508-9947-258fc3d35bbc', 'A', '22222222-2222-4222-8222-222222222206', 3, 3, 60000, 0, NULL, 'pending', NOW() - INTERVAL '2 days 28 minutes'),
  ('55555555-5555-4555-8555-555555555421', '44444444-4444-4444-8444-444444444403', '33333333-3333-4333-8333-333333333304', 'A', '22222222-2222-4222-8222-222222222201', 1, 1, 45000, 0, NULL, 'pending', NOW() - INTERVAL '1 day 29 minutes'),
  ('55555555-5555-4555-8555-555555555422', '44444444-4444-4444-8444-444444444403', '33333333-3333-4333-8333-333333333302', 'B', '22222222-2222-4222-8222-222222222201', 1, 2, 45000, 0, NULL, 'pending', NOW() - INTERVAL '1 day 28 minutes')
ON CONFLICT (id) DO UPDATE
SET
  audio_url = EXCLUDED.audio_url,
  upload_status = EXCLUDED.upload_status;

INSERT INTO peer_notes (id, turn_id, listener_id, client_note_id, timestamp_ms, error_type, note_text, created_at)
VALUES
  ('66666666-6666-4666-8666-666666666401', '55555555-5555-4555-8555-555555555401', '33333333-3333-4333-8333-333333333302', 'seed-note-peer-1', 8200, 'pronunciation', 'Âm cuối trong từ "study" cần rõ hơn.', NOW() - INTERVAL '6 days'),
  ('66666666-6666-4666-8666-666666666402', '55555555-5555-4555-8555-555555555403', '33333333-3333-4333-8333-333333333302', 'seed-note-peer-2', 32500, 'fluency', 'Có đoạn dừng hơi lâu trước khi đưa ví dụ.', NOW() - INTERVAL '6 days'),
  ('66666666-6666-4666-8666-666666666403', '55555555-5555-4555-8555-555555555404', '1ebb7a00-5352-4508-9947-258fc3d35bbc', 'seed-note-peer-3', 18600, 'grammar', 'Nên dùng thì quá khứ nhất quán khi kể về giáo viên cũ.', NOW() - INTERVAL '6 days'),
  ('66666666-6666-4666-8666-666666666404', '55555555-5555-4555-8555-555555555411', '33333333-3333-4333-8333-333333333303', 'seed-note-mentor-1', 10400, 'vocabulary', 'Có thể thay "good teacher" bằng "supportive and approachable teacher".', NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO UPDATE
SET note_text = EXCLUDED.note_text;

INSERT INTO ai_results (
  id,
  turn_id,
  status,
  whisper_transcript,
  fluency_score,
  lexical_score,
  grammar_score,
  pronunciation_score,
  pronunciation_detail,
  ai_feedback,
  created_at,
  updated_at
)
VALUES
  (
    '77777777-7777-4777-8777-777777777401',
    '55555555-5555-4555-8555-555555555401',
    'completed',
    'I am currently studying information technology at university. I enjoy learning with other students because we can share ideas and explain difficult concepts to each other.',
    6.5,
    6.5,
    6.0,
    6.0,
    '[{"word":"currently","accuracyScore":78},{"word":"technology","accuracyScore":74}]'::jsonb,
    '{"overallComment":"Bài nói trả lời đúng trọng tâm, có ví dụ cá nhân và độ trôi chảy tương đối tốt.","strengths":["Có mở rộng câu trả lời thay vì chỉ trả lời ngắn.","Từ vựng phù hợp chủ đề Education."],"improvements":["Chú ý âm cuối và nối âm.","Thêm một câu kết luận ngắn để câu trả lời gọn hơn."]}'::jsonb,
    NOW() - INTERVAL '6 days',
    NOW() - INTERVAL '6 days'
  ),
  (
    '77777777-7777-4777-8777-777777777402',
    '55555555-5555-4555-8555-555555555403',
    'completed',
    'One teacher who really influenced me was my English teacher in high school. She encouraged me to speak even when I made mistakes, so I became more confident.',
    6.5,
    7.0,
    6.5,
    6.5,
    '[{"word":"encouraged","accuracyScore":82},{"word":"confident","accuracyScore":80}]'::jsonb,
    '{"overallComment":"Part 2 có cấu trúc rõ, kể được câu chuyện cá nhân và có cảm xúc tự nhiên.","strengths":["Biết dùng ví dụ cụ thể.","Có nhiều cụm diễn đạt tốt."],"improvements":["Giảm filler ở đoạn giữa.","Phát triển thêm ảnh hưởng lâu dài của giáo viên."]}'::jsonb,
    NOW() - INTERVAL '6 days',
    NOW() - INTERVAL '6 days'
  ),
  (
    '77777777-7777-4777-8777-777777777403',
    '55555555-5555-4555-8555-555555555405',
    'completed',
    'In my opinion, a good teacher should be patient, knowledgeable, and approachable. Students learn better when they feel safe to ask questions.',
    7.0,
    7.0,
    6.5,
    6.5,
    '[]'::jsonb,
    '{"overallComment":"Câu trả lời Part 3 có quan điểm rõ và dùng từ khá chính xác.","strengths":["Lập luận trực tiếp.","Từ vựng như patient, knowledgeable, approachable phù hợp."],"improvements":["Có thể thêm ví dụ đối chiếu để câu trả lời thuyết phục hơn."]}'::jsonb,
    NOW() - INTERVAL '6 days',
    NOW() - INTERVAL '6 days'
  )
ON CONFLICT (turn_id) DO UPDATE
SET
  status = EXCLUDED.status,
  whisper_transcript = EXCLUDED.whisper_transcript,
  fluency_score = EXCLUDED.fluency_score,
  lexical_score = EXCLUDED.lexical_score,
  grammar_score = EXCLUDED.grammar_score,
  pronunciation_score = EXCLUDED.pronunciation_score,
  pronunciation_detail = EXCLUDED.pronunciation_detail,
  ai_feedback = EXCLUDED.ai_feedback,
  updated_at = NOW();

INSERT INTO mentor_reviews (
  id,
  session_id,
  mentor_id,
  student_id,
  overall_comment,
  pronunciation_comment,
  grammar_comment,
  vocabulary_comment,
  fluency_comment,
  suggested_next_steps,
  created_at,
  updated_at
)
VALUES (
  '88888888-8888-4888-8888-888888888401',
  '44444444-4444-4444-8444-444444444402',
  '33333333-3333-4333-8333-333333333303',
  '1ebb7a00-5352-4508-9947-258fc3d35bbc',
  'Bạn trả lời có ý rõ, nhưng cần phát triển ví dụ sâu hơn ở Part 2 và giữ tốc độ nói ổn định hơn.',
  'Âm cuối /s/ và /t/ cần bật rõ hơn, đặc biệt khi nói nhanh.',
  'Ngữ pháp nền ổn, nên dùng thêm mệnh đề quan hệ và câu phức.',
  'Từ vựng đúng chủ đề, có thể bổ sung collocation như "lifelong learning" và "student-centered approach".',
  'Có vài khoảng dừng dài; nên luyện nói theo dàn ý 3 ý chính trước khi ghi âm.',
  'Luyện 2 cue card chủ đề Education, ghi âm lại và tự kiểm tra filler words.',
  NOW() - INTERVAL '2 days',
  NOW() - INTERVAL '2 days'
)
ON CONFLICT (session_id) DO UPDATE
SET
  overall_comment = EXCLUDED.overall_comment,
  pronunciation_comment = EXCLUDED.pronunciation_comment,
  grammar_comment = EXCLUDED.grammar_comment,
  vocabulary_comment = EXCLUDED.vocabulary_comment,
  fluency_comment = EXCLUDED.fluency_comment,
  suggested_next_steps = EXCLUDED.suggested_next_steps,
  updated_at = NOW();

INSERT INTO classroom_posts (id, session_id, author_id, title, description, status, created_at, updated_at)
VALUES
  (
    '99999999-9999-4999-8999-999999999401',
    '44444444-4444-4444-8444-444444444401',
    '1ebb7a00-5352-4508-9947-258fc3d35bbc',
    'Part 2 chủ đề giáo viên truyền cảm hứng',
    'Bài nói có bố cục rõ, phù hợp để tham khảo cách triển khai cue card Education.',
    'published',
    NOW() - INTERVAL '5 days',
    NOW() - INTERVAL '5 days'
  ),
  (
    '99999999-9999-4999-8999-999999999402',
    '44444444-4444-4444-8444-444444444402',
    '1ebb7a00-5352-4508-9947-258fc3d35bbc',
    'Mentor góp ý bài Education Band 6.5',
    'Phiên mentor có nhận xét chi tiết về phát âm, từ vựng và fluency.',
    'published',
    NOW() - INTERVAL '1 day',
    NOW() - INTERVAL '1 day'
  )
ON CONFLICT (session_id) DO UPDATE
SET
  title = EXCLUDED.title,
  description = EXCLUDED.description,
  status = EXCLUDED.status,
  updated_at = NOW();

INSERT INTO classroom_comments (id, post_id, user_id, comment_text, created_at, updated_at)
VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa401', '99999999-9999-4999-8999-999999999401', '33333333-3333-4333-8333-333333333302', 'Mình thích cách bạn dùng ví dụ cá nhân ở Part 2.', NOW() - INTERVAL '4 days', NOW() - INTERVAL '4 days'),
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaa402', '99999999-9999-4999-8999-999999999402', '33333333-3333-4333-8333-333333333303', 'Bạn nên luyện thêm câu mở đầu ngắn để vào bài tự nhiên hơn.', NOW() - INTERVAL '20 hours', NOW() - INTERVAL '20 hours')
ON CONFLICT (id) DO UPDATE
SET comment_text = EXCLUDED.comment_text;

INSERT INTO classroom_post_likes (post_id, user_id, created_at)
VALUES
  ('99999999-9999-4999-8999-999999999401', '33333333-3333-4333-8333-333333333302', NOW() - INTERVAL '4 days'),
  ('99999999-9999-4999-8999-999999999401', '33333333-3333-4333-8333-333333333304', NOW() - INTERVAL '4 days'),
  ('99999999-9999-4999-8999-999999999402', '33333333-3333-4333-8333-333333333302', NOW() - INTERVAL '20 hours')
ON CONFLICT DO NOTHING;

INSERT INTO classroom_post_saves (post_id, user_id, created_at)
VALUES
  ('99999999-9999-4999-8999-999999999401', '1ebb7a00-5352-4508-9947-258fc3d35bbc', NOW() - INTERVAL '4 days'),
  ('99999999-9999-4999-8999-999999999402', '1ebb7a00-5352-4508-9947-258fc3d35bbc', NOW() - INTERVAL '20 hours')
ON CONFLICT DO NOTHING;

INSERT INTO notifications (
  id,
  recipient_id,
  actor_id,
  type,
  title,
  body,
  entity_type,
  entity_id,
  read_at,
  created_at
)
VALUES
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb401',
    '1ebb7a00-5352-4508-9947-258fc3d35bbc',
    '33333333-3333-4333-8333-333333333303',
    'mentor_review_completed',
    'Mentor đã gửi nhận xét',
    'Mentor Linh Nguyễn đã hoàn tất nhận xét cho phiên Education của bạn.',
    'session',
    '44444444-4444-4444-8444-444444444402',
    NULL,
    NOW() - INTERVAL '2 days'
  ),
  (
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbb402',
    '33333333-3333-4333-8333-333333333302',
    '1ebb7a00-5352-4508-9947-258fc3d35bbc',
    'classroom_post_published',
    'Có bài mới trong lớp học',
    'Nguyễn Lê Huy đã public một bài nói Part 2 chủ đề Education.',
    'classroom_post',
    '99999999-9999-4999-8999-999999999401',
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '5 days'
  )
ON CONFLICT (id) DO UPDATE
SET
  title = EXCLUDED.title,
  body = EXCLUDED.body,
  read_at = EXCLUDED.read_at;

-- Sample IELTS Speaking set (shared template) — Drinks (Part 1),
-- a monument cue card (Part 2), and monument discussion (Part 3).
INSERT INTO questions (id, topic_id, part_number, question_text, cue_card, suggested_phrases)
VALUES
  ('22222222-2222-4222-8222-222222223301', '11111111-1111-4111-8111-111111111113', 1,
   'What do you like to drink with your dinner? [Why?]', NULL, '[]'::jsonb),
  ('22222222-2222-4222-8222-222222223302', '11111111-1111-4111-8111-111111111113', 1,
   'Do you drink a lot of water every day? [Why/Why not?]', NULL, '[]'::jsonb),
  ('22222222-2222-4222-8222-222222223303', '11111111-1111-4111-8111-111111111113', 1,
   'Do you prefer drinking tea or coffee? [Why?]', NULL, '[]'::jsonb),
  ('22222222-2222-4222-8222-222222223304', '11111111-1111-4111-8111-111111111113', 1,
   'If people visit you in your home, what do you usually offer them to drink? [Why/Why not?]', NULL, '[]'::jsonb),
  ('22222222-2222-4222-8222-222222223305', '11111111-1111-4111-8111-111111111113', 2,
   'Describe a monument (e.g., a statue or sculpture) that you like.',
   '{"prompt":"Describe a monument (e.g., a statue or sculpture) that you like.","bullet_points":["what this monument is","where this monument is","what it looks like","and explain why you like this monument."]}'::jsonb,
   '[]'::jsonb),
  ('22222222-2222-4222-8222-222222223306', '11111111-1111-4111-8111-111111111113', 3,
   'What kinds of monuments do tourists in your country enjoy visiting?', NULL, '[]'::jsonb),
  ('22222222-2222-4222-8222-222222223307', '11111111-1111-4111-8111-111111111113', 3,
   'Why do you think there are often statues of famous people in public places?', NULL, '[]'::jsonb),
  ('22222222-2222-4222-8222-222222223308', '11111111-1111-4111-8111-111111111113', 3,
   'Do you agree that old monuments and buildings should always be preserved?', NULL, '[]'::jsonb),
  ('22222222-2222-4222-8222-222222223309', '11111111-1111-4111-8111-111111111113', 3,
   'Why is architecture such a popular university subject?', NULL, '[]'::jsonb),
  ('22222222-2222-4222-8222-222222223310', '11111111-1111-4111-8111-111111111113', 3,
   'In what ways has the design of homes changed in recent years?', NULL, '[]'::jsonb),
  ('22222222-2222-4222-8222-222222223311', '11111111-1111-4111-8111-111111111113', 3,
   'To what extent does the design of buildings affect people''s moods?', NULL, '[]'::jsonb)
ON CONFLICT (id) DO UPDATE
SET question_text = EXCLUDED.question_text,
    cue_card = EXCLUDED.cue_card,
    suggested_phrases = EXCLUDED.suggested_phrases;
