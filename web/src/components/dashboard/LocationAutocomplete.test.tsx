import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import LocationAutocomplete from './LocationAutocomplete';

// Mock the @vis.gl/react-google-maps hook to instantly return true
jest.mock('@vis.gl/react-google-maps', () => ({
  useApiIsLoaded: () => true,
}));

describe('LocationAutocomplete', () => {
  let mockOnChange: jest.Mock;
  let mockAddEventListener: jest.Mock;
  let placeSelectListener: any;

  beforeEach(() => {
    mockOnChange = jest.fn();
    placeSelectListener = null;
    mockAddEventListener = jest.fn((event, cb) => {
      if (event === 'gmp-placeselect') {
        placeSelectListener = cb;
      }
    });

    // Mock the global Google Maps object that the component expects
    (window as any).google = {
      maps: {
        places: {
          PlaceAutocompleteElement: jest.fn().mockImplementation(() => {
            const el = document.createElement('div');
            el.addEventListener = mockAddEventListener as any;
            el.removeEventListener = jest.fn() as any;
            return el;
          }),
        },
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('initializes Google Maps PlaceAutocompleteElement', () => {
    render(<LocationAutocomplete value="" onChange={mockOnChange} placeholder="Search City..." />);
    
    expect((window as any).google.maps.places.PlaceAutocompleteElement).toHaveBeenCalledTimes(1);
    expect(mockAddEventListener).toHaveBeenCalledWith('gmp-placeselect', expect.any(Function));
  });

  it('calls onChange when the user types in the injected input', () => {
    render(<LocationAutocomplete value="" onChange={mockOnChange} placeholder="Search City..." />);
    
    // Find the dynamically injected native <input> element
    const input = screen.getByPlaceholderText('Search City...');
    fireEvent.input(input, { target: { value: 'Duluth, GA' } });
    
    expect(mockOnChange).toHaveBeenCalledWith('Duluth, GA');
  });

  it('integrates with Google Maps Place API and calls onChange with formattedAddress', async () => {
    render(<LocationAutocomplete value="" onChange={mockOnChange} placeholder="Search City..." />);
    
    expect(placeSelectListener).toBeDefined();

    const mockPlace = {
      fetchFields: jest.fn().mockResolvedValue(undefined),
      formattedAddress: 'Savannah, GA, USA',
      displayName: 'Savannah',
    };

    // Simulate Google Maps firing the place select event
    placeSelectListener({ place: mockPlace });

    // Wait for the async place.fetchFields promise to resolve
    await waitFor(() => {
      expect(mockPlace.fetchFields).toHaveBeenCalledWith({ fields: ['displayName', 'formattedAddress'] });
      expect(mockOnChange).toHaveBeenCalledWith('Savannah, GA, USA');
    });
    
    // Verify the native input value was also updated
    const input = screen.getByPlaceholderText('Search City...') as HTMLInputElement;
    expect(input.value).toBe('Savannah, GA, USA');
  });

  it('falls back to displayName if formattedAddress is missing', async () => {
    render(<LocationAutocomplete value="" onChange={mockOnChange} placeholder="Search City..." />);
    
    const mockPlace = {
      fetchFields: jest.fn().mockResolvedValue(undefined),
      formattedAddress: undefined,
      displayName: 'Savannah',
    };

    placeSelectListener({ place: mockPlace });

    await waitFor(() => {
      expect(mockOnChange).toHaveBeenCalledWith('Savannah');
    });
  });
});