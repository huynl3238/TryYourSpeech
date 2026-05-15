INSERT INTO topics (id, name)
VALUES ('11111111-1111-4111-8111-111111111111', 'Education')
ON CONFLICT (name) DO NOTHING;

INSERT INTO questions (id, topic_id, part_number, question_text, cue_card)
VALUES
  (
    '22222222-2222-4222-8222-222222222201',
    '11111111-1111-4111-8111-111111111111',
    1,
    'Do you work or study?',
    NULL
  ),
  (
    '22222222-2222-4222-8222-222222222202',
    '11111111-1111-4111-8111-111111111111',
    1,
    'What subject did you enjoy most at school?',
    NULL
  ),
  (
    '22222222-2222-4222-8222-222222222203',
    '11111111-1111-4111-8111-111111111111',
    1,
    'Do you prefer studying alone or with other people?',
    NULL
  ),
  (
    '22222222-2222-4222-8222-222222222204',
    '11111111-1111-4111-8111-111111111111',
    1,
    'How do you usually prepare for an important exam?',
    NULL
  ),
  (
    '22222222-2222-4222-8222-222222222205',
    '11111111-1111-4111-8111-111111111111',
    2,
    'Describe a teacher who had an important influence on you.',
    '{"prompt":"Describe a teacher who had an important influence on you.","bullet_points":["who this teacher was","what subject they taught","what you learned from them","and explain why this teacher influenced you."]}'::jsonb
  ),
  (
    '22222222-2222-4222-8222-222222222206',
    '11111111-1111-4111-8111-111111111111',
    3,
    'What qualities make someone a good teacher?',
    NULL
  ),
  (
    '22222222-2222-4222-8222-222222222207',
    '11111111-1111-4111-8111-111111111111',
    3,
    'How has technology changed education in recent years?',
    NULL
  ),
  (
    '22222222-2222-4222-8222-222222222208',
    '11111111-1111-4111-8111-111111111111',
    3,
    'Do you think online learning can replace traditional classrooms?',
    NULL
  )
ON CONFLICT (id) DO NOTHING;
