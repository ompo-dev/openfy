import * as React from 'react';
import { render, RenderResult } from '@testing-library/react-native';
import { Copyrights, CopyrightsPropsType } from '../Copyrights';
import { COPYRIGHT_SIGN, SOUND_COPYRIGHT_SIGN } from '@config';

enum TEST_IDS {
  COPYRIGHT_VIEW = 'copyright-view',
  COPYRIGHT_TEXT_0 = 'copyright-text-0',
  COPYRIGHT_TEXT_1 = 'copyright-text-1',
}

describe('Copyrights', () => {
  let container: RenderResult;
  const defaultProps: CopyrightsPropsType = {
    copyrightTexts: [
      `${SOUND_COPYRIGHT_SIGN} copyright mock 1`,
      `${COPYRIGHT_SIGN} copyright mock 2`,
    ],
  };

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('renders correctly', async () => {
    container = await render(<Copyrights {...defaultProps} />);
    expect(container.getByTestId(TEST_IDS.COPYRIGHT_VIEW)).toBeTruthy();
  });

  describe('UI', () => {
    it('displays all copyright texts without changing content', async () => {
      container = await render(<Copyrights {...defaultProps} />);

      const firstText = container.getByTestId(TEST_IDS.COPYRIGHT_TEXT_0);
      const secondText = container.getByTestId(TEST_IDS.COPYRIGHT_TEXT_1);

      expect(firstText.props.children).toEqual(defaultProps.copyrightTexts[0]);
      expect(secondText.props.children).toEqual(defaultProps.copyrightTexts[1]);
    });
  });
});
