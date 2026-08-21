import * as React from 'react';
import { render, RenderResult } from '@testing-library/react-native';
import { Info, InfoPropsType } from '../Info';

describe('Info', () => {
  let container: RenderResult;
  const defaultProps: InfoPropsType = {
    infoTexts: ['August 12, 2022', '28 tracks \u2022 1 hr 36 min'],
  };

  beforeEach(async () => {
    container = await render(<Info {...defaultProps} />);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly with infoTexts', () => {
    expect(container.getByText('August 12, 2022')).toBeTruthy();
    expect(container.getByText('28 tracks \u2022 1 hr 36 min')).toBeTruthy();
  });
});
