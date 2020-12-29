describe('Sample test 101', () => {
  it('Works as expected', () => {
    const age = 100;
    expect(1).toEqual(1);
    expect(age).toEqual(100);
  });

  it('Handles ranges just fine', () => {
    const age = 200;
    expect(age).toBeGreaterThan(100);
  });

  it('Makes a list of dog names', () => {
    const dogs = ['snickers', 'hugo'];
    expect(dogs).toEqual(dogs);
    expect(dogs).toContain('snickers');
    expect(dogs).toContain('snickers');
  });
});
