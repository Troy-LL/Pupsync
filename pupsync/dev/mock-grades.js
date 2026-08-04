/**
 * Sample grades fixtures for Dev preview (State E).
 * Select with ?scene=grades&fixture=<id>
 */
(function () {
  function sem(schoolYearCode, semester, subjects) {
    return {
      label: `School Year ${schoolYearCode} - ${semester} Semester`,
      schoolYearCode,
      semester,
      subjects
    };
  }

  function sub(subjectCode, description, units, grade, gradeText) {
    return {
      subjectCode,
      description,
      units: String(units),
      grade: grade == null ? null : grade,
      gradeText: gradeText != null ? String(gradeText) : grade == null ? '—' : String(grade)
    };
  }

  const fixtures = {
    summa: {
      label: 'Summa on track (gold)',
      ok: true,
      error: null,
      semesters: [
        sem('2425', 'First', [
          sub('GEED 001', 'Understanding the Self', '3.0', 1.0),
          sub('COMP 001', 'Introduction to Computing', '3.0', 1.0),
          sub('MATH 001', 'College Algebra', '3.0', 1.25)
        ]),
        sem('2425', 'Second', [
          sub('COMP 009', 'Object Oriented Programming', '3.0', 1.0),
          sub('INTE 202', 'Integrative Programming 1', '3.0', 1.25),
          sub('PATHFIT 4', 'Physical Activity Towards Health and Fitness 4', '2.0', 1.0)
        ])
      ]
    },

    magna: {
      label: 'Magna on track (silver)',
      ok: true,
      error: null,
      semesters: [
        sem('2324', 'First', [
          sub('GEED 004', 'Purposive Communication', '3.0', 1.25),
          sub('COMP 001', 'Introduction to Computing', '3.0', 1.25),
          sub('MATH 001', 'College Algebra', '3.0', 1.5)
        ]),
        sem('2324', 'Second', [
          sub('COMP 002', 'Computer Programming 1', '3.0', 1.25),
          sub('GEED 002', 'Readings in Philippine History', '3.0', 1.25),
          sub('CWTS 001', 'Civic Welfare Training Service 1', '3.0', 1.0)
        ]),
        sem('2425', 'First', [
          sub('GEED 001', 'Understanding the Self', '3.0', 1.25),
          sub('COMP 009', 'Object Oriented Programming', '3.0', 1.25),
          sub('MATH 010', 'Discrete Mathematics', '3.0', 1.5),
          sub('CWTS 002', 'Civic Welfare Training Service 2', '3.0', 1.0)
        ]),
        sem('2425', 'Second', [
          sub('INTE 202', 'Integrative Programming 1', '3.0', 1.25),
          sub('COMP 010', 'Data Structures', '3.0', 1.25),
          sub('PATHFIT 4', 'Physical Activity Towards Health and Fitness 4', '2.0', 1.0)
        ])
      ]
    },

    cum: {
      label: 'Cum Laude on track (bronze)',
      ok: true,
      error: null,
      semesters: [
        sem('2425', 'First', [
          sub('GEED 001', 'Understanding the Self', '3.0', 1.5),
          sub('COMP 001', 'Introduction to Computing', '3.0', 1.5),
          sub('MATH 001', 'College Algebra', '3.0', 1.75)
        ]),
        sem('2425', 'Second', [
          sub('COMP 009', 'Object Oriented Programming', '3.0', 1.5),
          sub('INTE 202', 'Integrative Programming 1', '3.0', 1.5),
          sub('PATHFIT 4', 'Physical Activity Towards Health and Fitness 4', '2.0', 1.25)
        ])
      ]
    },

    below: {
      label: 'Below Latin honors',
      ok: true,
      error: null,
      semesters: [
        sem('2425', 'First', [
          sub('GEED 001', 'Understanding the Self', '3.0', 2.0),
          sub('COMP 001', 'Introduction to Computing', '3.0', 1.75),
          sub('MATH 001', 'College Algebra', '3.0', 2.0)
        ]),
        sem('2425', 'Second', [
          sub('COMP 009', 'Object Oriented Programming', '3.0', 1.75),
          sub('INTE 202', 'Integrative Programming 1', '3.0', 2.0),
          sub('PATHFIT 4', 'Physical Activity Towards Health and Fitness 4', '2.0', 1.5)
        ])
      ]
    },

    failing: {
      label: 'Failing grade (5.00)',
      ok: true,
      error: null,
      semesters: [
        sem('2425', 'First', [
          sub('GEED 001', 'Understanding the Self', '3.0', 1.25),
          sub('COMP 001', 'Introduction to Computing', '3.0', 1.5),
          sub('MATH 001', 'College Algebra', '3.0', 5.0, '5.00')
        ]),
        sem('2425', 'Second', [
          sub('COMP 009', 'Object Oriented Programming', '3.0', 1.5),
          sub('INTE 202', 'Integrative Programming 1', '3.0', 1.25)
        ])
      ]
    },

    lost: {
      label: 'Lost honors (grade > 2.50)',
      ok: true,
      error: null,
      semesters: [
        sem('2425', 'First', [
          sub('GEED 001', 'Understanding the Self', '3.0', 1.0),
          sub('COMP 001', 'Introduction to Computing', '3.0', 1.25),
          sub('MATH 001', 'College Algebra', '3.0', 1.5)
        ]),
        sem('2425', 'Second', [
          sub('COMP 009', 'Object Oriented Programming', '3.0', 1.25),
          sub('INTE 202', 'Integrative Programming 1', '3.0', 3.0, '3.00'),
          sub('PATHFIT 4', 'Physical Activity Towards Health and Fitness 4', '2.0', 1.0)
        ])
      ]
    },

    /** Fool's medals — GWA still hits a tier, but a rule breaks eligibility. */
    foolsGold: {
      label: "Fool's gold (cardboard)",
      ok: true,
      error: null,
      semesters: [
        sem('2425', 'First', [
          sub('GEED 001', 'Understanding the Self', '3.0', 1.0),
          sub('COMP 001', 'Introduction to Computing', '3.0', 1.0),
          sub('MATH 001', 'College Algebra', '3.0', 1.0)
        ]),
        sem('2425', 'Second', [
          sub('COMP 009', 'Object Oriented Programming', '3.0', 1.0),
          sub('INTE 202', 'Integrative Programming 1', '1.0', 3.0, '3.00'),
          sub('PATHFIT 4', 'Physical Activity Towards Health and Fitness 4', '2.0', 1.0)
        ])
      ]
    },

    foolsSilver: {
      label: "Fool's silver (soda can)",
      ok: true,
      error: null,
      semesters: [
        sem('2425', 'First', [
          sub('GEED 001', 'Understanding the Self', '3.0', 1.25),
          sub('COMP 001', 'Introduction to Computing', '3.0', 1.25),
          sub('MATH 001', 'College Algebra', '3.0', 1.25)
        ]),
        sem('2425', 'Second', [
          sub('COMP 009', 'Object Oriented Programming', '3.0', 1.25),
          sub('INTE 202', 'Integrative Programming 1', '1.0', 3.0, '3.00'),
          sub('PATHFIT 4', 'Physical Activity Towards Health and Fitness 4', '2.0', 1.0)
        ])
      ]
    },

    foolsBronze: {
      label: "Fool's bronze (dalgona)",
      ok: true,
      error: null,
      semesters: [
        sem('2425', 'First', [
          sub('GEED 001', 'Understanding the Self', '3.0', 1.5),
          sub('COMP 001', 'Introduction to Computing', '3.0', 1.5),
          sub('MATH 001', 'College Algebra', '3.0', 1.5)
        ]),
        sem('2425', 'Second', [
          sub('COMP 009', 'Object Oriented Programming', '3.0', 1.5),
          sub('INTE 202', 'Integrative Programming 1', '1.0', 3.0, '3.00'),
          sub('PATHFIT 4', 'Physical Activity Towards Health and Fitness 4', '2.0', 1.25)
        ])
      ]
    },

    inc: {
      label: 'Incomplete (INC)',
      ok: true,
      error: null,
      semesters: [
        sem('2425', 'First', [
          sub('GEED 001', 'Understanding the Self', '3.0', 1.25),
          sub('COMP 001', 'Introduction to Computing', '3.0', null, 'INC'),
          sub('MATH 001', 'College Algebra', '3.0', 1.5)
        ]),
        sem('2425', 'Second', [
          sub('COMP 009', 'Object Oriented Programming', '3.0', 1.25),
          sub('INTE 202', 'Integrative Programming 1', '3.0', 1.5)
        ])
      ]
    }
  };

  window.PUPSYNC_MOCK_GRADE_FIXTURES = fixtures;

  const params = new URLSearchParams(window.location.search);
  const id = params.get('fixture') || 'magna';
  window.PUPSYNC_MOCK_GRADES = fixtures[id] || fixtures.magna;
  window.PUPSYNC_MOCK_GRADE_FIXTURE_ID = fixtures[id] ? id : 'magna';
})();
