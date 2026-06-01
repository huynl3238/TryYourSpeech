INSERT INTO topics (id, name)
VALUES ('11111111-1111-4111-8111-111111111111', 'Education')
ON CONFLICT (name) DO NOTHING;

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
