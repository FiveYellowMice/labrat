##
# This class represents a command from Telegram.

class LabRat::Telegram::Command


  attr_reader :name, :arg, :message


  def initialize(options = {})
    self.name = options[:name]
    self.arg = options[:arg]
    self.message = options[:message]
  end


  def name=(val)
    raise(ArgumentError, 'Name has to be a string') unless val.nil? || val.is_a?(String)
    @name = val || ''
  end


  def arg=(val)
    raise(ArgumentError, 'Argument has to be a string') unless val.nil? || val.is_a?(String)
    @arg = val || ''
  end


  def message=(val)
    raise(ArgumentError, 'Message has to be a Telegram message') unless val.is_a? Telegram::Bot::Types::Message
    @message = val
  end


  def to_s
    if arg.empty?
      "/#{@name}"
    else
      "/#{@name} #{@arg}"
    end
  end


end
