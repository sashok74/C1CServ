export const regexPatterns = [
    {
      name: 'Конденсатор чип CC',
      params: [
        { name: 'параметр1', pattern: /\d+(,\d+)?[a-zA-Z]+F/i },
        { name: 'параметр2', pattern: /[±]\d+%/i },
        { name: 'параметр3', pattern: /\d+v/i },
        { name: 'параметр4', pattern: /X\d+R|NPO|NP0/i },
        { name: 'параметр5', pattern: /\(\d+\)/i }
      ],
    },
  ];