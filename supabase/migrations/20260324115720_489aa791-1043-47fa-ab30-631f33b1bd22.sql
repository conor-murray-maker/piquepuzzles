-- Flag Easy deals for onboarding
UPDATE deals SET reserved_for = 'onboarding' WHERE dds_blended < 26;

-- Flag 7 low-Medium deals for Monday challenges
UPDATE deals SET reserved_for = 'monday_challenge' WHERE id IN (
  '3d875fd3-7781-4c17-9dcd-d30e4dd51cfd',
  'd56f69ae-fdb2-426b-8caf-fe9a670142c5',
  'fdcefdd0-d423-4d43-83e2-2c4565c20cd9',
  'ef30d862-1b69-44ac-9520-88d69e87d545',
  'c7513266-34d4-40ce-ab07-3afd63c3b937',
  '4742bc24-97fe-46af-80ce-fe0c842fdc90',
  '1d095c80-a314-4fa7-a75c-8ca1b751de5f'
);