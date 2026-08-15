-- ============================================================================
-- Bộ đề chuẩn của hệ thống — 15 đề, lấy từ ielts_data.doc.
--
-- Mỗi đề là một hàng `topics`, chứa đúng 4 câu Part 1 + 1 cue card Part 2 +
-- 3 câu Part 3. Con số đó không phải ngẫu nhiên: `PART_FORMAT` trong
-- sessionModel.js đòi đúng 4/1/3 cho một buổi đầy đủ, nên một đề vừa khít một
-- buổi. Hệ quả là `selectSessionQuestions` random trong từng phần cũng chỉ có
-- một cách chọn duy nhất — người luyện nhận nguyên vẹn một đề như đề thi thật,
-- chứ không phải bốn câu ghép từ bốn đề khác nhau.
--
-- Id đặt cố định theo số đề (de{NN}0000-…-{PP}{II}: PP là part, II là thứ tự
-- câu) để chạy lại seed là cập nhật đúng hàng cũ, không sinh ra bản sao.
-- ============================================================================

INSERT INTO topics (id, name, scope, owner_id, status)
VALUES
  ('de000000-0000-4000-8000-000000000001', 'Đề 01: A beautiful place', 'system', NULL, 'open'),
  ('de000000-0000-4000-8000-000000000002', 'Đề 02: Childhood neighbourhood', 'system', NULL, 'open'),
  ('de000000-0000-4000-8000-000000000003', 'Đề 03: A big city you would like to visit', 'system', NULL, 'open'),
  ('de000000-0000-4000-8000-000000000004', 'Đề 04: A monument you like', 'system', NULL, 'open'),
  ('de000000-0000-4000-8000-000000000005', 'Đề 05: Doing something in a hurry', 'system', NULL, 'open'),
  ('de000000-0000-4000-8000-000000000006', 'Đề 06: A law that was a good idea', 'system', NULL, 'open'),
  ('de000000-0000-4000-8000-000000000007', 'Đề 07: A tourist attraction', 'system', NULL, 'open'),
  ('de000000-0000-4000-8000-000000000008', 'Đề 08: A review of a product or service', 'system', NULL, 'open'),
  ('de000000-0000-4000-8000-000000000009', 'Đề 09: A luxury item', 'system', NULL, 'open'),
  ('de000000-0000-4000-8000-000000000010', 'Đề 10: Technology you stopped using', 'system', NULL, 'open'),
  ('de000000-0000-4000-8000-000000000011', 'Đề 11: A hotel that you know', 'system', NULL, 'open'),
  ('de000000-0000-4000-8000-000000000012', 'Đề 12: A website you bought from', 'system', NULL, 'open'),
  ('de000000-0000-4000-8000-000000000013', 'Đề 13: A TV programme about science', 'system', NULL, 'open'),
  ('de000000-0000-4000-8000-000000000014', 'Đề 14: Something you bought for your home', 'system', NULL, 'open'),
  ('de000000-0000-4000-8000-000000000015', 'Đề 15: A book that made you think', 'system', NULL, 'open')
ON CONFLICT (id) DO UPDATE
SET
  name = EXCLUDED.name,
  scope = EXCLUDED.scope,
  owner_id = EXCLUDED.owner_id,
  status = EXCLUDED.status,
  updated_at = NOW();

INSERT INTO questions (id, topic_id, part_number, question_text, cue_card, suggested_phrases)
VALUES
  -- Đề 01 -------------------------------------------------------------------
  ('de010000-0000-4000-8000-000000000101', 'de000000-0000-4000-8000-000000000001', 1, 'Where do you live?', NULL, '[]'::jsonb),
  ('de010000-0000-4000-8000-000000000102', 'de000000-0000-4000-8000-000000000001', 1, 'Do you live in an apartment?', NULL, '[]'::jsonb),
  ('de010000-0000-4000-8000-000000000103', 'de000000-0000-4000-8000-000000000001', 1, 'Do you like living here?', NULL, '[]'::jsonb),
  ('de010000-0000-4000-8000-000000000104', 'de000000-0000-4000-8000-000000000001', 1, 'Why do many people like living in an apartment?', NULL, '[]'::jsonb),
  ('de010000-0000-4000-8000-000000000201', 'de000000-0000-4000-8000-000000000001', 2,
   'Describe a beautiful place you have visited.',
   '{"prompt":"Describe a beautiful place you have visited.","bullet_points":["Where it is","When and with whom you went there","What activities you did there","and how you feel about that place"]}'::jsonb,
   '[]'::jsonb),
  ('de010000-0000-4000-8000-000000000301', 'de000000-0000-4000-8000-000000000001', 3, 'Do older adults prefer living in larger cities?', NULL, '[]'::jsonb),
  ('de010000-0000-4000-8000-000000000302', 'de000000-0000-4000-8000-000000000001', 3, 'What problems does overpopulation cause in big cities?', NULL, '[]'::jsonb),
  ('de010000-0000-4000-8000-000000000303', 'de000000-0000-4000-8000-000000000001', 3, 'What measures need to be taken to make cities more livable?', NULL, '[]'::jsonb),

  -- Đề 02 -------------------------------------------------------------------
  ('de020000-0000-4000-8000-000000000101', 'de000000-0000-4000-8000-000000000002', 1, 'What did you study in history lessons when you were at school?', NULL, '[]'::jsonb),
  ('de020000-0000-4000-8000-000000000102', 'de000000-0000-4000-8000-000000000002', 1, 'Did you enjoy studying history at school? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de020000-0000-4000-8000-000000000103', 'de000000-0000-4000-8000-000000000002', 1, 'How often do you watch TV programmes about history now? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de020000-0000-4000-8000-000000000104', 'de000000-0000-4000-8000-000000000002', 1, 'What period in history would you like to learn more about? [Why?]', NULL, '[]'::jsonb),
  ('de020000-0000-4000-8000-000000000201', 'de000000-0000-4000-8000-000000000002', 2,
   'Describe the neighbourhood you lived in when you were a child.',
   '{"prompt":"Describe the neighbourhood you lived in when you were a child.","bullet_points":["Where in your town/city the neighbourhood was","What kind of people lived there","What it was like to live in this neighbourhood","and explain whether you would like to live in this neighbourhood in the future."]}'::jsonb,
   '[]'::jsonb),
  ('de020000-0000-4000-8000-000000000301', 'de000000-0000-4000-8000-000000000002', 3, 'What sort of things can neighbours do to help each other?', NULL, '[]'::jsonb),
  ('de020000-0000-4000-8000-000000000302', 'de000000-0000-4000-8000-000000000002', 3, 'How well do people generally know their neighbours in your country?', NULL, '[]'::jsonb),
  ('de020000-0000-4000-8000-000000000303', 'de000000-0000-4000-8000-000000000002', 3, 'How important do you think it is to have good neighbours?', NULL, '[]'::jsonb),

  -- Đề 03 -------------------------------------------------------------------
  ('de030000-0000-4000-8000-000000000101', 'de000000-0000-4000-8000-000000000003', 1, 'Did you have a favourite book when you were a child? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de030000-0000-4000-8000-000000000102', 'de000000-0000-4000-8000-000000000003', 1, 'How much reading do you do for your work/studies? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de030000-0000-4000-8000-000000000103', 'de000000-0000-4000-8000-000000000003', 1, 'What kinds of books do you read for pleasure? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de030000-0000-4000-8000-000000000104', 'de000000-0000-4000-8000-000000000003', 1, 'Do you prefer to read a newspaper or a magazine online, or to buy a copy? [Why?]', NULL, '[]'::jsonb),
  ('de030000-0000-4000-8000-000000000201', 'de000000-0000-4000-8000-000000000003', 2,
   'Describe a big city you would like to visit.',
   '{"prompt":"Describe a big city you would like to visit.","bullet_points":["Which big city you would like to visit","How you would travel there","What you would do there","and explain why you would like to visit this big city."]}'::jsonb,
   '[]'::jsonb),
  ('de030000-0000-4000-8000-000000000301', 'de000000-0000-4000-8000-000000000003', 3, 'What are the most interesting things to do while visiting cities on holiday?', NULL, '[]'::jsonb),
  ('de030000-0000-4000-8000-000000000302', 'de000000-0000-4000-8000-000000000003', 3, 'Why can it be expensive to visit cities on holiday?', NULL, '[]'::jsonb),
  ('de030000-0000-4000-8000-000000000303', 'de000000-0000-4000-8000-000000000003', 3, 'Do you think it is better to visit cities alone or in a group with friends?', NULL, '[]'::jsonb),

  -- Đề 04 -------------------------------------------------------------------
  ('de040000-0000-4000-8000-000000000101', 'de000000-0000-4000-8000-000000000004', 1, 'What do you like to drink with your dinner? [Why?]', NULL, '[]'::jsonb),
  ('de040000-0000-4000-8000-000000000102', 'de000000-0000-4000-8000-000000000004', 1, 'Do you drink a lot of water every day? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de040000-0000-4000-8000-000000000103', 'de000000-0000-4000-8000-000000000004', 1, 'Do you prefer drinking tea or coffee? [Why?]', NULL, '[]'::jsonb),
  ('de040000-0000-4000-8000-000000000104', 'de000000-0000-4000-8000-000000000004', 1, 'If people visit you in your home, what do you usually offer them to drink? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de040000-0000-4000-8000-000000000201', 'de000000-0000-4000-8000-000000000004', 2,
   'Describe a monument (e.g., a statue or sculpture) that you like.',
   '{"prompt":"Describe a monument (e.g., a statue or sculpture) that you like.","bullet_points":["What this monument is","Where this monument is","What it looks like","and explain why you like this monument."]}'::jsonb,
   '[]'::jsonb),
  ('de040000-0000-4000-8000-000000000301', 'de000000-0000-4000-8000-000000000004', 3, 'What kinds of monuments do tourists in your country enjoy visiting?', NULL, '[]'::jsonb),
  ('de040000-0000-4000-8000-000000000302', 'de000000-0000-4000-8000-000000000004', 3, 'Why do you think there are often statues of famous people in public places?', NULL, '[]'::jsonb),
  ('de040000-0000-4000-8000-000000000303', 'de000000-0000-4000-8000-000000000004', 3, 'Do you agree that old monuments and buildings should always be preserved?', NULL, '[]'::jsonb),

  -- Đề 05 -------------------------------------------------------------------
  ('de050000-0000-4000-8000-000000000101', 'de000000-0000-4000-8000-000000000005', 1, 'Do you think it''s better to use a paper map or a map on your phone? [Why?]', NULL, '[]'::jsonb),
  ('de050000-0000-4000-8000-000000000102', 'de000000-0000-4000-8000-000000000005', 1, 'When was the last time you needed to use a map? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de050000-0000-4000-8000-000000000103', 'de000000-0000-4000-8000-000000000005', 1, 'If you visit a new city, do you always use a map to find your way around? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de050000-0000-4000-8000-000000000104', 'de000000-0000-4000-8000-000000000005', 1, 'In general, do you find it easy to read maps? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de050000-0000-4000-8000-000000000201', 'de000000-0000-4000-8000-000000000005', 2,
   'Describe an occasion when you had to do something in a hurry.',
   '{"prompt":"Describe an occasion when you had to do something in a hurry.","bullet_points":["What you had to do","Why you had to do this in a hurry","How well you did this","and explain how you felt about having to do this in a hurry."]}'::jsonb,
   '[]'::jsonb),
  ('de050000-0000-4000-8000-000000000301', 'de000000-0000-4000-8000-000000000005', 3, 'Do you think it''s OK to arrive late when meeting a friend?', NULL, '[]'::jsonb),
  ('de050000-0000-4000-8000-000000000302', 'de000000-0000-4000-8000-000000000005', 3, 'What should happen to people who arrive late for work?', NULL, '[]'::jsonb),
  ('de050000-0000-4000-8000-000000000303', 'de000000-0000-4000-8000-000000000005', 3, 'Can you suggest how people can make sure they don''t arrive late?', NULL, '[]'::jsonb),

  -- Đề 06 -------------------------------------------------------------------
  ('de060000-0000-4000-8000-000000000101', 'de000000-0000-4000-8000-000000000006', 1, 'Can you find food from many different countries where you live? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de060000-0000-4000-8000-000000000102', 'de000000-0000-4000-8000-000000000006', 1, 'How often do you eat typical food from other countries? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de060000-0000-4000-8000-000000000103', 'de000000-0000-4000-8000-000000000006', 1, 'Have you ever tried making food from another country? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de060000-0000-4000-8000-000000000104', 'de000000-0000-4000-8000-000000000006', 1, 'What food from your country would you recommend to people from other countries? [Why?]', NULL, '[]'::jsonb),
  ('de060000-0000-4000-8000-000000000201', 'de000000-0000-4000-8000-000000000006', 2,
   'Describe a law that was introduced in your country and that you thought was a very good idea.',
   '{"prompt":"Describe a law that was introduced in your country and that you thought was a very good idea.","bullet_points":["What the law was","Who introduced it","When and why it was introduced","and explain why you thought this law was such a good idea."]}'::jsonb,
   '[]'::jsonb),
  ('de060000-0000-4000-8000-000000000301', 'de000000-0000-4000-8000-000000000006', 3, 'What kinds of rules are common in a school?', NULL, '[]'::jsonb),
  ('de060000-0000-4000-8000-000000000302', 'de000000-0000-4000-8000-000000000006', 3, 'How important is it to have rules in a school?', NULL, '[]'::jsonb),
  ('de060000-0000-4000-8000-000000000303', 'de000000-0000-4000-8000-000000000006', 3, 'What do you recommend should happen if children break school rules?', NULL, '[]'::jsonb),

  -- Đề 07 -------------------------------------------------------------------
  ('de070000-0000-4000-8000-000000000101', 'de000000-0000-4000-8000-000000000007', 1, 'Who do you spend most time studying/working with? [Why?]', NULL, '[]'::jsonb),
  ('de070000-0000-4000-8000-000000000102', 'de000000-0000-4000-8000-000000000007', 1, 'What kinds of things do you study/work on with other people? [Why?]', NULL, '[]'::jsonb),
  ('de070000-0000-4000-8000-000000000103', 'de000000-0000-4000-8000-000000000007', 1, 'Are there times when you study/work better by yourself? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de070000-0000-4000-8000-000000000104', 'de000000-0000-4000-8000-000000000007', 1, 'Is it important to like the people you study/work with? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de070000-0000-4000-8000-000000000201', 'de000000-0000-4000-8000-000000000007', 2,
   'Describe a tourist attraction you enjoyed visiting.',
   '{"prompt":"Describe a tourist attraction you enjoyed visiting.","bullet_points":["What this tourist attraction is","When and why you visited it","What you did there","and explain why you enjoyed visiting this tourist attraction."]}'::jsonb,
   '[]'::jsonb),
  ('de070000-0000-4000-8000-000000000301', 'de000000-0000-4000-8000-000000000007', 3, 'What are the most popular tourist attractions in your country?', NULL, '[]'::jsonb),
  ('de070000-0000-4000-8000-000000000302', 'de000000-0000-4000-8000-000000000007', 3, 'How do the types of tourist attractions that younger people like to visit compare with those that older people like to visit?', NULL, '[]'::jsonb),
  ('de070000-0000-4000-8000-000000000303', 'de000000-0000-4000-8000-000000000007', 3, 'Do you agree that some tourist attractions (e.g. national museums/galleries) should be free to visit?', NULL, '[]'::jsonb),

  -- Đề 08 -------------------------------------------------------------------
  ('de080000-0000-4000-8000-000000000101', 'de000000-0000-4000-8000-000000000008', 1, 'Do you have a favourite flower or plant? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de080000-0000-4000-8000-000000000102', 'de000000-0000-4000-8000-000000000008', 1, 'What kinds of flowers and plants grow near where you live? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de080000-0000-4000-8000-000000000103', 'de000000-0000-4000-8000-000000000008', 1, 'Is it important to you to have flowers and plants in your home? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de080000-0000-4000-8000-000000000104', 'de000000-0000-4000-8000-000000000008', 1, 'Have you ever bought flowers for someone else? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de080000-0000-4000-8000-000000000201', 'de000000-0000-4000-8000-000000000008', 2,
   'Describe a review you read about a product or service.',
   '{"prompt":"Describe a review you read about a product or service.","bullet_points":["Where you read the review","What the product or service was","What information the review gave about the product or service","and explain what you did as a result of reading this review."]}'::jsonb,
   '[]'::jsonb),
  ('de080000-0000-4000-8000-000000000301', 'de000000-0000-4000-8000-000000000008', 3, 'What do you think it might be like to work in a customer service job?', NULL, '[]'::jsonb),
  ('de080000-0000-4000-8000-000000000302', 'de000000-0000-4000-8000-000000000008', 3, 'Do you agree that customers are more likely to complain nowadays?', NULL, '[]'::jsonb),
  ('de080000-0000-4000-8000-000000000303', 'de000000-0000-4000-8000-000000000008', 3, 'How important is it for companies to take all customer complaints seriously?', NULL, '[]'::jsonb),

  -- Đề 09 -------------------------------------------------------------------
  ('de090000-0000-4000-8000-000000000101', 'de000000-0000-4000-8000-000000000009', 1, 'Is summer your favourite time of year? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de090000-0000-4000-8000-000000000102', 'de000000-0000-4000-8000-000000000009', 1, 'What do you do in summer when the weather''s very hot? [Why?]', NULL, '[]'::jsonb),
  ('de090000-0000-4000-8000-000000000103', 'de000000-0000-4000-8000-000000000009', 1, 'Do you go on holiday every summer? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de090000-0000-4000-8000-000000000104', 'de000000-0000-4000-8000-000000000009', 1, 'Did you enjoy the summer holidays when you were at school? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de090000-0000-4000-8000-000000000201', 'de000000-0000-4000-8000-000000000009', 2,
   'Describe a luxury item you would like to own in the future.',
   '{"prompt":"Describe a luxury item you would like to own in the future.","bullet_points":["What item you would like to own","What this item looks like","Why you would like to own this item","and explain whether you think you will ever own this item."]}'::jsonb,
   '[]'::jsonb),
  ('de090000-0000-4000-8000-000000000301', 'de000000-0000-4000-8000-000000000009', 3, 'Which expensive items would many young people (in your country) like to buy?', NULL, '[]'::jsonb),
  ('de090000-0000-4000-8000-000000000302', 'de000000-0000-4000-8000-000000000009', 3, 'How do the expensive items that younger people want to buy differ from those that older people want to buy?', NULL, '[]'::jsonb),
  ('de090000-0000-4000-8000-000000000303', 'de000000-0000-4000-8000-000000000009', 3, 'Do you think that people are more likely to buy expensive items for their friends or for themselves?', NULL, '[]'::jsonb),

  -- Đề 10 -------------------------------------------------------------------
  ('de100000-0000-4000-8000-000000000101', 'de000000-0000-4000-8000-000000000010', 1, 'What kinds of fast food have you tried? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de100000-0000-4000-8000-000000000102', 'de000000-0000-4000-8000-000000000010', 1, 'Do you ever use a microwave to cook food quickly? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de100000-0000-4000-8000-000000000103', 'de000000-0000-4000-8000-000000000010', 1, 'How popular are fast food restaurants where you live? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de100000-0000-4000-8000-000000000104', 'de000000-0000-4000-8000-000000000010', 1, 'When would you go to a fast-food restaurant? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de100000-0000-4000-8000-000000000201', 'de000000-0000-4000-8000-000000000010', 2,
   'Describe some technology (e.g. an app, phone, software program) that you decided to stop using.',
   '{"prompt":"Describe some technology (e.g. an app, phone, software program) that you decided to stop using.","bullet_points":["When and where you got this technology","Why you started using this technology","Why you decided to stop using it","and explain how you feel about the decision you made."]}'::jsonb,
   '[]'::jsonb),
  ('de100000-0000-4000-8000-000000000301', 'de000000-0000-4000-8000-000000000010', 3, 'What kinds of computer games do people play in your country?', NULL, '[]'::jsonb),
  ('de100000-0000-4000-8000-000000000302', 'de000000-0000-4000-8000-000000000010', 3, 'Why do people enjoy playing computer games?', NULL, '[]'::jsonb),
  ('de100000-0000-4000-8000-000000000303', 'de000000-0000-4000-8000-000000000010', 3, 'Do you think that all computer games should have a minimum age for players?', NULL, '[]'::jsonb),

  -- Đề 11 -------------------------------------------------------------------
  ('de110000-0000-4000-8000-000000000101', 'de000000-0000-4000-8000-000000000011', 1, 'What kinds of emails do you receive about your work or studies?', NULL, '[]'::jsonb),
  ('de110000-0000-4000-8000-000000000102', 'de000000-0000-4000-8000-000000000011', 1, 'Do you prefer to email, phone or text your friends?', NULL, '[]'::jsonb),
  ('de110000-0000-4000-8000-000000000103', 'de000000-0000-4000-8000-000000000011', 1, 'Do you reply to emails and messages as soon as you receive them?', NULL, '[]'::jsonb),
  ('de110000-0000-4000-8000-000000000104', 'de000000-0000-4000-8000-000000000011', 1, 'Are you happy to receive emails that are advertising things?', NULL, '[]'::jsonb),
  ('de110000-0000-4000-8000-000000000201', 'de000000-0000-4000-8000-000000000011', 2,
   'Describe a hotel that you know.',
   '{"prompt":"Describe a hotel that you know.","bullet_points":["Where this hotel is","What this hotel looks like","What facilities this hotel has","and explain whether you think this is a nice hotel to stay in."]}'::jsonb,
   '[]'::jsonb),
  ('de110000-0000-4000-8000-000000000301', 'de000000-0000-4000-8000-000000000011', 3, 'What things are important when people are choosing a hotel?', NULL, '[]'::jsonb),
  ('de110000-0000-4000-8000-000000000302', 'de000000-0000-4000-8000-000000000011', 3, 'Why do some people not like staying in hotels?', NULL, '[]'::jsonb),
  ('de110000-0000-4000-8000-000000000303', 'de000000-0000-4000-8000-000000000011', 3, 'Do you think staying in a luxury hotel is a waste of money?', NULL, '[]'::jsonb),

  -- Đề 12 -------------------------------------------------------------------
  ('de120000-0000-4000-8000-000000000101', 'de000000-0000-4000-8000-000000000012', 1, 'How many languages can you speak? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de120000-0000-4000-8000-000000000102', 'de000000-0000-4000-8000-000000000012', 1, 'How useful will English be to you in your future? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de120000-0000-4000-8000-000000000103', 'de000000-0000-4000-8000-000000000012', 1, 'What do you remember about learning languages at school? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de120000-0000-4000-8000-000000000104', 'de000000-0000-4000-8000-000000000012', 1, 'What do you think would be the hardest language for you to learn? [Why?]', NULL, '[]'::jsonb),
  ('de120000-0000-4000-8000-000000000201', 'de000000-0000-4000-8000-000000000012', 2,
   'Describe a website that you bought something from.',
   '{"prompt":"Describe a website that you bought something from.","bullet_points":["What the website is","What you bought from this website","How satisfied you were with what you bought","and explain what you liked or disliked about using this website."]}'::jsonb,
   '[]'::jsonb),
  ('de120000-0000-4000-8000-000000000301', 'de000000-0000-4000-8000-000000000012', 3, 'What kinds of things do people in your country often buy from online shops?', NULL, '[]'::jsonb),
  ('de120000-0000-4000-8000-000000000302', 'de000000-0000-4000-8000-000000000012', 3, 'Why do you think online shopping has become so popular nowadays?', NULL, '[]'::jsonb),
  ('de120000-0000-4000-8000-000000000303', 'de000000-0000-4000-8000-000000000012', 3, 'What are some possible disadvantages of buying things from online shops?', NULL, '[]'::jsonb),

  -- Đề 13 -------------------------------------------------------------------
  ('de130000-0000-4000-8000-000000000101', 'de000000-0000-4000-8000-000000000013', 1, 'How often do you wear jewellery? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de130000-0000-4000-8000-000000000102', 'de000000-0000-4000-8000-000000000013', 1, 'What type of jewellery do you like best? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de130000-0000-4000-8000-000000000103', 'de000000-0000-4000-8000-000000000013', 1, 'When do people like to give jewellery in your country? [Why?]', NULL, '[]'::jsonb),
  ('de130000-0000-4000-8000-000000000104', 'de000000-0000-4000-8000-000000000013', 1, 'Have you ever given jewellery to someone as a gift? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de130000-0000-4000-8000-000000000201', 'de000000-0000-4000-8000-000000000013', 2,
   'Describe an interesting TV programme you watched about a science topic.',
   '{"prompt":"Describe an interesting TV programme you watched about a science topic.","bullet_points":["What science topic this TV programme was about","When you saw this TV programme","What you learnt from this TV programme about a science topic","and explain why you found this TV programme interesting."]}'::jsonb,
   '[]'::jsonb),
  ('de130000-0000-4000-8000-000000000301', 'de000000-0000-4000-8000-000000000013', 3, 'How interested are most people in your country in science?', NULL, '[]'::jsonb),
  ('de130000-0000-4000-8000-000000000302', 'de000000-0000-4000-8000-000000000013', 3, 'Why do you think children today might be better at science than their parents?', NULL, '[]'::jsonb),
  ('de130000-0000-4000-8000-000000000303', 'de000000-0000-4000-8000-000000000013', 3, 'How do you suggest the public can learn more about scientific developments?', NULL, '[]'::jsonb),

  -- Đề 14 -------------------------------------------------------------------
  ('de140000-0000-4000-8000-000000000101', 'de000000-0000-4000-8000-000000000014', 1, 'Which social media websites do you use?', NULL, '[]'::jsonb),
  ('de140000-0000-4000-8000-000000000102', 'de000000-0000-4000-8000-000000000014', 1, 'How much time do you spend on social media sites? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de140000-0000-4000-8000-000000000103', 'de000000-0000-4000-8000-000000000014', 1, 'What kind of information about yourself have you put on social media? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de140000-0000-4000-8000-000000000104', 'de000000-0000-4000-8000-000000000014', 1, 'Is there anything you don''t like about social media? [Why?]', NULL, '[]'::jsonb),
  ('de140000-0000-4000-8000-000000000201', 'de000000-0000-4000-8000-000000000014', 2,
   'Describe something you liked very much which you bought for your home.',
   '{"prompt":"Describe something you liked very much which you bought for your home.","bullet_points":["What you bought","When and where you bought it","Why you chose this particular thing","and explain why you liked it so much."]}'::jsonb,
   '[]'::jsonb),
  ('de140000-0000-4000-8000-000000000301', 'de000000-0000-4000-8000-000000000014', 3, 'Why do some people buy lots of things for their home?', NULL, '[]'::jsonb),
  ('de140000-0000-4000-8000-000000000302', 'de000000-0000-4000-8000-000000000014', 3, 'Do you think it is very expensive to make a home look nice?', NULL, '[]'::jsonb),
  ('de140000-0000-4000-8000-000000000303', 'de000000-0000-4000-8000-000000000014', 3, 'Why don''t some people care about how their home looks?', NULL, '[]'::jsonb),

  -- Đề 15 -------------------------------------------------------------------
  ('de150000-0000-4000-8000-000000000101', 'de000000-0000-4000-8000-000000000015', 1, 'What job would you like to have ten years from now? [Why?]', NULL, '[]'::jsonb),
  ('de150000-0000-4000-8000-000000000102', 'de000000-0000-4000-8000-000000000015', 1, 'How useful will English be for your future? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de150000-0000-4000-8000-000000000103', 'de000000-0000-4000-8000-000000000015', 1, 'How much traveling do you hope to do in the future? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de150000-0000-4000-8000-000000000104', 'de000000-0000-4000-8000-000000000015', 1, 'How do you think your life will change in the future? [Why/Why not?]', NULL, '[]'::jsonb),
  ('de150000-0000-4000-8000-000000000201', 'de000000-0000-4000-8000-000000000015', 2,
   'Describe a book that you enjoyed reading because you had to think a lot.',
   '{"prompt":"Describe a book that you enjoyed reading because you had to think a lot.","bullet_points":["What this book was","Why you decided to read it","What reading this book made you think about","and explain why you enjoyed reading this book."]}'::jsonb,
   '[]'::jsonb),
  ('de150000-0000-4000-8000-000000000301', 'de000000-0000-4000-8000-000000000015', 3, 'What are the most popular types of children''s books in your country?', NULL, '[]'::jsonb),
  ('de150000-0000-4000-8000-000000000302', 'de000000-0000-4000-8000-000000000015', 3, 'What are the benefits of parents reading books to their children?', NULL, '[]'::jsonb),
  ('de150000-0000-4000-8000-000000000303', 'de000000-0000-4000-8000-000000000015', 3, 'Should parents always let children choose the books they read?', NULL, '[]'::jsonb)
ON CONFLICT (id) DO UPDATE
SET
  topic_id = EXCLUDED.topic_id,
  part_number = EXCLUDED.part_number,
  question_text = EXCLUDED.question_text,
  cue_card = EXCLUDED.cue_card,
  suggested_phrases = EXCLUDED.suggested_phrases;

-- ============================================================================
-- Gỡ mọi bộ câu hỏi chung khác — chỉ 15 đề ở trên được dùng cho phiên mới.
--
-- Quét theo "không phải một trong 15 đề" chứ không liệt kê tên bộ cũ, để một
-- bộ rác tạo lỡ tay qua trang admin cũng bị dọn, không phải sửa file này thêm
-- lần nào nữa.
--
-- Chỉ đụng vào bộ `scope = 'system'`. Bộ `mentor_private` là tài sản riêng của
-- từng mentor và họ tự tạo trong lúc dùng app; seed mà xoá thì mỗi lần chạy
-- lại là xoá mất công của người thật. Chúng cũng không cần dọn: ghép cặp chỉ
-- lấy bộ `system`, nên bộ riêng của mentor không bao giờ rơi vào một phiên
-- luyện đôi.
--
-- Xoá thẳng không phải lúc nào cũng làm được: một câu đã có người luyện thì
-- `turns.question_id` còn trỏ vào nó, xoá đi là xoá lịch sử của người thật.
-- Nên xoá cái nào không ai dùng, còn cái nào đang bị trỏ tới thì chuyển sang
-- 'hidden'. `selectEligibleTopic` chỉ lấy topic có status = 'open', nên bộ cũ
-- không bao giờ rơi vào một phiên mới nữa dù hàng còn nằm lại trong bảng.
--
-- Chạy sau cùng, vì phần dữ liệu minh hoạ ở trên phải trỏ sang Đề 01 trước đã.
-- ============================================================================

DELETE FROM questions q
USING topics t
WHERE t.id = q.topic_id
  AND COALESCE(t.scope, 'system') = 'system'
  AND t.id::text NOT LIKE 'de000000-0000-4000-8000-0000000000%'
  AND NOT EXISTS (SELECT 1 FROM turns tr WHERE tr.question_id = q.id);

DELETE FROM topics t
WHERE COALESCE(t.scope, 'system') = 'system'
  AND t.id::text NOT LIKE 'de000000-0000-4000-8000-0000000000%'
  AND NOT EXISTS (SELECT 1 FROM questions q WHERE q.topic_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM sessions s WHERE s.topic_id = t.id)
  AND NOT EXISTS (SELECT 1 FROM mentor_sessions m WHERE m.topic_id = t.id);

UPDATE topics t
SET status = 'hidden', updated_at = NOW()
WHERE COALESCE(t.scope, 'system') = 'system'
  AND t.id::text NOT LIKE 'de000000-0000-4000-8000-0000000000%'
  AND COALESCE(t.status, 'open') <> 'hidden';
