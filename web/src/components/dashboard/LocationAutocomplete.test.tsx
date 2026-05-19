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
  let mockPlace: any;

  beforeEach(() => {
    mockOnChange = jest.fn();
    placeSelectListener = null;
    mockPlace = {};
    mockAddEventListener = jest.fn((event, cb) => {
      if (event === 'place_changed') {
        placeSelectListener = cb;
      }
    });

    // Mock the global Google Maps object that the component expects
    (window as any).google = {
      maps: {
        event: {
          removeListener: jest.fn(),
        },
        places: {
          Autocomplete: jest.fn().mockImplementation(() => {
            return {
              addListener: mockAddEventListener,
              getPlace: () => mockPlace
            };
          }),
        },
      },
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('initializes classic Google Maps Autocomplete', () => {
    render(<LocationAutocomplete value="" onChange={mockOnChange} placeholder="Search City..." />);
    
    expect((window as any).google.maps.places.Autocomplete).toHaveBeenCalledTimes(1);
    expect(mockAddEventListener).toHaveBeenCalledWith('place_changed', expect.any(Function));
  });

  it('calls onChange when the user types in the native input', () => {
    render(<LocationAutocomplete value="" onChange={mockOnChange} placeholder="Search City..." />);
    
    // Find the dynamically injected native <input> element
    const input = screen.getByPlaceholderText('Search City...');
    fireEvent.change(input, { target: { value: 'Duluth, GA' } });
    
    expect(mockOnChange).toHaveBeenCalledWith('Duluth, GA');
  });

  it('integrates with Google Maps Place API and calls onChange with formatted_address', async () => {
    render(<LocationAutocomplete value="" onChange={mockOnChange} placeholder="Search City..." />);
    
    expect(placeSelectListener).toBeDefined();

    mockPlace = {
      formatted_address: 'Savannah, GA, USA',
      name: 'Savannah',
    };

    // Simulate Google Maps firing the place select event
    placeSelectListener();
    expect(mockOnChange).toHaveBeenCalledWith('Savannah, GA, USA');
  });

  it('falls back to name if formatted_address is missing', async () => {
    render(<LocationAutocomplete value="" onChange={mockOnChange} placeholder="Search City..." />);
    
    mockPlace = {
      formatted_address: undefined,
      name: 'Savannah',
    };

    placeSelectListener();
    expect(mockOnChange).toHaveBeenCalledWith('Savannah');
  });
});